"use client";

import { PlusCircleIcon } from "lucide-react"
import { Button } from "./ui/button"
import { useRouter } from "next/navigation";

function PlaceholderDocument() {
    const router = useRouter();
    


    const handleClick = () => {
        // check if user is FREE and if theyre over the file limit, push to upgrade page
        
        router.push("/dashboard/upload");
    };

  return (
    <Button onClick={handleClick} className="flex flex-col items-center justify-center w-64 h-80 rounded-xl bg-gray-200 drop-shadow-md text-gray-400">
        <PlusCircleIcon className="size-16"/>
        <p>Add a document</p>
    </Button>
  )
}
export default PlaceholderDocument