import { use } from "react";

function ChatToFilepage({ params }: { params: Promise<{ id: string }>}) {
  const { id } = use(params);
  return (
    <div>ChatToFilePage: {id} </div>
  )
}
export default ChatToFilepage