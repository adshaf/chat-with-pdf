"use client";

import { useUser } from "@clerk/nextjs";
import { Message } from "./Chat";
import Image from "next/image";
import { BotIcon, Loader2Icon } from "lucide-react";
import Markdown from "react-markdown";

function ChatMessage({message}: {message: Message}) {
    const isHuman = message.role === "human";
    const { user } = useUser();

  return (
    <div className={`chat ${isHuman ? "chat-end" : "chat-start"}`}>
        <div className="chat-image avatar">
            <div className="w-10 rounder-full">
                {isHuman ? (
                    user?. imageUrl && (
                        <Image
                            src={user?.imageUrl}
                            alt="Profile Picture"
                            width={40}
                            height={40}
                            className="rounded-full"
                        />
                    )
                ) : (
                    <div className="size-10 bg-indigo-600 flex items-center justify-center">
                        <BotIcon className="text-white size-7 " />
                    </div>    
                ) }
            </div>
        </div>
        
        <div className={` chat-bubble prose ${isHuman && "bg-indigo-600 text-white"}`}>
            {message.message === "Thinking..." ? (
                <Loader2Icon className="animate-spin size-5 text-white" />
            ) : (
                <Markdown>{message.message}</Markdown>
            )}
        </div>
    </div>
  )
}
export default ChatMessage