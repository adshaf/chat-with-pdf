'use server';

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";



export async function generateEmbeddings(docId: string) {
    auth.protect(); // Prevent non signed-in users from accessing

    // Turn a pdf into embeddings
    await generateEmbeddingsInPineconeVectorsStore(docId);

    revalidatePath('/dashboard');
}