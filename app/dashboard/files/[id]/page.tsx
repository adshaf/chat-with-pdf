import { use } from "react";

import { auth } from "@clerk/nextjs/server";
import { adminDb } from "@/firebase-admin";
import PdfView from "@/components/PdfView";

async function ChatToFilepage({ params }: { params: { id: string }}) {
  const { id } = params;
  auth.protect();
  
  const { userId } = await auth();

  const ref = await adminDb
  .collection("userId")
  .doc(userId!)
  .collection("files")
  .doc(id)
  .get();

  const url = ref.data()?.downloadUrl;

  return (
    <div className="grid lg:grid-cols-5 h-full overflow-hidden">
      {/* right section */}
      <div className="lg:col-span-2 overflow-auto">
        {/* ChatAI */}
      </div>

      {/* Left section */}
      <div className="col-span-5 lg:col-span-3 bg-gray-100 border-r-2 lg:border-indigo-600 lg:-order-1 overflow-auto">
        {/* PDF render */}
        <PdfView url={url}/>
      </div>
    </div>
  )
}

export default ChatToFilepage