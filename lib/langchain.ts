import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PineconeStore } from "@langchain/pinecone";
import { adminDb } from "@/firebase-admin";
import { auth } from "@clerk/nextjs/server";
import pineconeClient from "./pinecone";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { Index, RecordMetadata } from "@pinecone-database/pinecone";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Initialize the OpenAI model with API key and model name
const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4o",
});

export const indexName = "chat-with-pdf";

async function fetchMessagesFromDB(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not found");
  }

  console.log("--- Fetching chat history from the firestore database... ---");
  
  const chats = await adminDb
    .collection("users")
    .doc(userId)
    .collection("files")
    .doc(docId)
    .collection("chat")
    .orderBy("createdAt", "asc")
    .get();

  const chatHistory = chats.docs.map((doc) =>
    doc.data().role === "human"
      ? new HumanMessage(doc.data().message)
      : new AIMessage(doc.data().message)
  );

  console.log(`--- Fetched last ${chatHistory.length} messages successfully ---`);
  console.log(chatHistory.map((msg) => msg.content.toString()));

  return chatHistory;
}

export async function generateDocs(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not found");
  }

  console.log("--- Fetching the download URL from Firebase ---");
  const firebaseRef = await adminDb
    .collection("users")
    .doc(userId)
    .collection("files")
    .doc(docId)
    .get();

  console.log("firebaseRef data:", firebaseRef.data());

  const downloadUrl = firebaseRef.data()?.downloadUrl;

  if (!downloadUrl) {
    throw new Error("Download URL not found");
  }

  console.log(`--- Download URL fetched successfully: ${downloadUrl} ---`);

  // Fetch the PDF from the specified URL
  const response = await fetch(downloadUrl);

  // Load the PDF into PDFDocument object
  const data = await response.blob();

  // Load the PDF document from the specified path
  console.log("--- Loading PDF document... ---");
  const loader = new PDFLoader(data);
  const docs = await loader.load();

  // Split the loaded documents into smaller parts for easier processing
  console.log("--- Splitting the document into smaller parts... ---");
  const splitter = new RecursiveCharacterTextSplitter();
  const splitDocs = await splitter.splitDocuments(docs);
  console.log(`--- Split into ${splitDocs.length} parts ---`);

  return splitDocs;
}

async function namespaceExists(
  index: Index<RecordMetadata>,
  namespace: string
) {
  if (namespace === null) throw new Error("No namespace value provided.");

  const { namespaces } = await index.describeIndexStats();
  return namespaces?.[namespace] !== undefined;
}

export async function generateEmbeddingsInPineconeVectorStore(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not found");
  }

  let pineconeVectorStore;

  // Generate embeddings (numerical representations) for the split documents
  console.log("--- Generating embeddings... ---");
  const embeddings = new OpenAIEmbeddings();

  const index = await pineconeClient.index(indexName);
  const namespaceAlreadyExists = await namespaceExists(index, docId);

  if (namespaceAlreadyExists) {
    console.log(
      `--- Namespace ${docId} already exists, reusing existing embeddings... ---`
    );

    pineconeVectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: docId,
    });

    return pineconeVectorStore;
  } else {
    // If the namespace does not exist, download the pdf from firestore via the stored Download URL & generate the embeddings and store them in the Pinecone vector store
    const splitDocs = await generateDocs(docId);

    console.log(
      `--- Storing the embeddings in namespace ${docId} in the ${indexName} Pinecone vector store ---`
    );

    pineconeVectorStore = await PineconeStore.fromDocuments(
      splitDocs,
      embeddings,
      {
        pineconeIndex: index,
        namespace: docId,
      }
    );

    return pineconeVectorStore; // FIX: Added return statement
  }
}

const generateLangchainCompletion = async (docId: string, question: string) => {
  // Get or create the vector store
  const pineconeVectorStore = await generateEmbeddingsInPineconeVectorStore(docId);
  
  if (!pineconeVectorStore) {
    throw new Error("Pinecone vector store not found");
  }

  // Create a retriever to search through the vector store
  console.log("--- Creating a retriever... ---");
  const retriever = pineconeVectorStore.asRetriever();

  // Fetch chat history from database
  const chatHistory = await fetchMessagesFromDB(docId);

  // Format chat history for the prompt
  const formattedHistory = chatHistory
    .map((msg) => {
      if (msg instanceof HumanMessage) {
        return `Human: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    })
    .join("\n");

  // Create a prompt that rewrites the question based on chat history
  const historyAwarePrompt = ChatPromptTemplate.fromTemplate(`
    Given the following conversation history and a new user question, 
    rewrite the question to be a standalone question that can be understood without the chat history.
    
    Chat History:
    {chat_history}
    
    New Question: {question}
    
    Standalone Question:`);

  // Create a prompt for answering based on retrieved context
  const answerPrompt = ChatPromptTemplate.fromTemplate(`
    Answer the user's question based on the following context from the PDF document.
    If you cannot answer the question based on the context, say so.
    
    Context:
    {context}
    
    Chat History:
    {chat_history}
    
    Question: {question}
    
    Answer:`);

  console.log("--- Creating the RAG chain... ---");

  // Create the complete chain
  const chain = RunnableSequence.from([
    // Step 1: Rewrite the question based on history
    {
      standalone_question: historyAwarePrompt.pipe(model).pipe(new StringOutputParser()),
      chat_history: (input: { question: string; chat_history: string }) => input.chat_history,
      question: (input: { question: string; chat_history: string }) => input.question,
    },
    // Step 2: Retrieve relevant documents using the standalone question
    async (input: { standalone_question: string; chat_history: string; question: string }) => {
      const docs = await retriever.invoke(input.standalone_question);
      return {
        context: docs.map((d) => d.pageContent).join("\n\n"),
        chat_history: input.chat_history,
        question: input.question,
      };
    },
    // Step 3: Generate the final answer
    answerPrompt,
    model,
    new StringOutputParser(),
  ]);

  console.log("--- Running the chain... ---");
  const reply = await chain.invoke({
    question: question,
    chat_history: formattedHistory,
  });

  // Print the results to the console
  console.log("Answer:", reply);
  return reply;
};

// Export the model and the run function
export { model, generateLangchainCompletion };































// import { ChatOpenAI } from "@langchain/openai";
// import { RunnablePassthrough, RunnableSequence  } from "@langchain/core/runnables";
// import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
// import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// import { OpenAIEmbeddings } from "@langchain/openai";
// import { ChatPromptTemplate } from "@langchain/core/prompts";
// import { PineconeStore } from "@langchain/pinecone";
// import { adminDb } from "@/firebase-admin";
// import { auth } from "@clerk/nextjs/server";
// import pineconeClient from "./pinecone";
// import { HumanMessage, AIMessage } from "@langchain/core/messages";
// import { PineconeConflictError } from "@pinecone-database/pinecone/dist/errors";
// import { Index, RecordMetadata } from "@pinecone-database/pinecone";
// import { doc } from "firebase/firestore";
// // import { DocumentCompressorPipeline } from "langchain/retrievers/document_compressors";
// // import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
// // import { LLMChainExtractor } from "langchain/retrievers/document_compressors";




// // Initialise the OpenAI model with API key and model name
// const model = new ChatOpenAI ({
//     apiKey: process.env.OPENAI_API_KEY,
//     modelName: "gpt-4o",
// })

// export const indexName = "chat-with-pdf";

// async function fetchMessagesFromDB(docId: string) {
//   const { userId } = await auth();

//   if(!userId) {
//     throw new Error("User not found");
//   }

//   console.log("--- Fetching chat history from the firestore database... ---");
//   // Get the last 6 messages from the chat history
//   const chats = await adminDb
//     .collection("users")
//     .doc(userId!)
//     .collection("files")
//     .doc(docId)
//     .collection("chat")
//     .orderBy("createdAt", "asc")
//     // .limit(LIMIT)
//     .get();

//   const chatHistory = chats.docs.map((doc) => doc.data().role === "human" ? new HumanMessage(doc.data().message) : new AIMessage(doc.data().message));

//   console.log(`--- Fetched last ${chatHistory.length} messages successfully ---`);
//   console.log(chatHistory.map((msg) => msg.content.toString()));

//   return chatHistory;
// }

// export async function generateDocs(docId: string) {
//   const { userId } = await auth();

//   if (!userId) {
//     throw new Error("User not found");
//   }

//   console.log("--- Fetching the download URL from Firebase ---");
//   const firebaseRef = await adminDb
//     .collection("users")
//     .doc(userId)
//     .collection("files")
//     .doc(docId)
//     .get();

//   console.log("firebaseRef data:", firebaseRef.data());
  
//   const downloadUrl = firebaseRef.data()?.downloadUrl;

//   if (!downloadUrl) {
//     throw new Error("Download URL not found");
//   }

//   console.log(`--- Download URL fetched successfully: ${downloadUrl} ---`)

//   // Fetch the PDF from the specified URL
//   const response = await fetch(downloadUrl);

//   // Load the PDF into PDFDocument object
//   const data = await response.blob();

//   // Load the PDF document from the specified path
//   console.log("--- Loading PDF document... ---");
//   const loader = new PDFLoader(data);
//   const docs = await loader.load();

//   // Split the loaded documents into smaller parts for easier processing
//   console.log("--- Splitting the docuemnt into smaller parts... ---");
//   const splitter = new RecursiveCharacterTextSplitter();
//   const splitDocs = await splitter.splitDocuments(docs);
//   console.log(`--- Split into ${splitDocs.length} parts ---`);

//   return splitDocs;

// }

// async function namespaceExists(index: Index<RecordMetadata>, namespace: string) {
//   if (namespace === null) throw new Error("No namespace value provided.");

//   const { namespaces } = await index.describeIndexStats();
//   return namespaces?.[namespace] !== undefined;
// }

// export async function generateEmbeddingsInPineconeVectorStore(docId: string) {
//   const { userId } = await auth();

//   if (!userId) {
//     throw new Error("User not found");
//   }

//   let pineconeVectorStore;

//   // Generate embeddings (numerical representations) for the split documents
//   console.log("--- Generating embeddings... ---");
//   const embeddings = new OpenAIEmbeddings();

//   const index = await pineconeClient.index(indexName);
//   const namespaceAlreadyExists = await namespaceExists(index,docId);

//   if (namespaceAlreadyExists) {
//     console.log(
//       `--- Namespace ${docId} already exists,r esuing existing embeddings... ---`
//     );

//     pineconeVectorStore = await PineconeStore.fromExistingIndex(embeddings, {
//       pineconeIndex: index,
//       namespace: docId,
//     });

//     return pineconeVectorStore;
//   } else {
//     // If the namepsace does not exist, download the pdf from firestore via the stored Download URL & generate the embeddings and store them in the Pinecone vector store
//     const splitDocs = await generateDocs(docId);

//     console.log(`--- Storing the embeddings in namespace ${docId} in the ${indexName} Pinecone vector store ---`)

//     pineconeVectorStore = await PineconeStore.fromDocuments(
//       splitDocs,
//       embeddings,
//       {
//         pineconeIndex: index,
//         namespace: docId,
//       }
//     )

//   }

// }

// const generateLangchainCompletion = async (docId: string, question: string) => {
//   let pineconeVectorStore;

//   pineconeVectorStore = await generateEmbeddingsInPineconeVectorStore(docId);
//     if(!pineconeVectorStore) {
//       throw new Error("Pinecone vector store not found");
//     }

//   // Create a retriever to search through the vector store
//   console.log("--- Creating a retriever... ---");
//   const retriever = pineconeVectorStore.asRetriever();

//   // Fetch chat history from database
//   const chatHistory = await fetchMessagesFromDB(docId);

//   const historyAwarePrompt = ChatPromptTemplate.fromTemplate(`
//     Rewrite the user query based on the conversation history.
//     History:
//     ${chatHistory}

//     User question: ${question}
//   `);

//   // Define a prompt template for generating search queries based on conversation history
//   const finalPrompt = ChatPromptTemplate.fromTemplate(`
//     Use the following retrieved context to answer the user's question.

//     Context:
//     {context}

//     User question:
//     {question}

//     Answer in a clear, concise way.
//   `);


//   // Create a history aware retriever chain that uses the model, retriever, and prompt
//   console.log("--- Creating a history-aware retriever chain... ---");
  
//   const historyAwareRetriever = RunnableSequence.from([
//     historyAwarePrompt,
//     model,
//     (output) => output.content, // rewritten query
//     retriever,
//   ]);

//   const fullChain = RunnableSequence.from([
//     async (input) => {
//       const docs = await historyAwareRetriever.invoke(input);
//       return { ...input, context: docs.map(d => d.pageContent).join("\n") };
//     },
//     finalPrompt,
//     model,
//   ]);

//   // Define a prompt template for answering questions based on retrieved context
//   console.log("--- Defining a prompt template for answering questions... ---");
//   const historyAwareRetrieverPrompt = ChatPromptTemplate.fromMessages([
//     [
//       "system",
//       "Answer the user's questions based on the below context:\n\n{context}",
//     ],

//     ...chatHistory, // Insert the actual history here

//     ["user", "{input}"],
//   ]);


//   // Create a chain to combine the retrieved documents into a coherent response
//   console.log("--- Creating a document combining chain... ---");
//   const historyAwareCombineDocsChain = await createStuffDocumentsChain({
//     llm: model,
//     prompt: historyAwareRetrieverPrompt,
//   });

//   console.log("--- Running the chain with a sample conversation... ---");
//   const reply = await conversationalRetrievalChain.invoke({
//     chat_history: chatHistory,
//     input: question,
//   });

//   // Print the results to the console
//   console.log(reply.answer);
//   return reply.answer;

// }

// // Export the model and the run function
// export { model, generateLangchainCompletion };