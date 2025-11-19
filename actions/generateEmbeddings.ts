'use server';


import { revalidatePath } from "next/cache";

import { auth } from "@clerk/nextjs/server";
import { generateEmbeddingsInPineconeVectorStore } from "@/lib/langchain";

export async function generateEmbeddings(docId: string) {
    auth.protect(); // Prevent non signed-in users from accessing

    // Turn a pdf into embeddings
    await generateEmbeddingsInPineconeVectorStore(docId);

    revalidatePath('/dashboard');

    return { completed: true };
}