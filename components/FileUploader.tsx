"use client";

import useUpload, { Status, StatusText } from '@/hooks/useUpload';
import { CheckCircleIcon, CircleArrowDown, HammerIcon, RocketIcon, SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { JSX, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';


function FileUploader() {
    const { progress, status, fileId, handleUpload } = useUpload();
    const router = useRouter();

    useEffect(() => {
        if (fileId) {
            router.push(`/dashboard/files/${fileId}`);
        }
    }, [fileId, router])

    const onDrop = useCallback(async (acceptedFiles: File[])  => {
        const file = acceptedFiles[0];

        if (file) {
            await handleUpload(file);
        } else {
            // toast for error
        }
    }, [handleUpload]);

    const statusIcons: Record<Status, JSX.Element> = {
        [StatusText.UPLOADING]: (
            <RocketIcon className='size-20 text-indigo-600' />
        ),
        [StatusText.UPLOADED]: (
            <CheckCircleIcon className='size-20 text-indigo-600' />
        ),
        [StatusText.SAVING]: (
            <SaveIcon className='size-20 text-indigo-600' />
        ),
        [StatusText.GENERATING]: (
            <HammerIcon className='size-20 text-indigo-600' />
        ),
    }

    const { getRootProps, getInputProps, isDragActive, isFocused, isDragAccept } = 
    useDropzone({
        onDrop,
        maxFiles: 1,
        accept: {
            "application/pdf": [".pdf"],
        },
    });

    const uploadInProgress = progress != null && progress >= 0 && progress <= 100;



    return (
    <div className='flex flex-col gap-4 items-center max-w-7xl mx-auto'>
        {/* Loading... */}
        {uploadInProgress && (
            <div className='mt-32 flex flex-col justify-center items-center gap-5'>
                <div className={`radial-progress bg-indigo-300 text-white border-indigo-600 border-4 ${
                    progress === 100 && "hidden"
                }`}
                role="progressbar"
                style={{
                    "--value": progress,
                    "--size": "12rem",
                    "--thickness": "1.3rem",
                } as React.CSSProperties}
                >
                    {progress} %
                </div>

                {/* Render status icon */}

                {status && statusIcons[status]}

                <p className='text-indigo-600 animate-pulse'>{status}</p>
            </div>
        )}

        {!uploadInProgress && (<div {...getRootProps()}
            className={`p-10 border-indigo-600 text-indigo-600 border-2 border-dashed mt-10 w-[90%] rounded-lg h-96 flex items-center justify-center ${isFocused || isDragAccept ? "bg-indigo-300" : "bg-indigo-100"}`}
        >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justfy-center ">
                {
                    isDragActive ?
                    <>
                        <RocketIcon className="size-20 animate-ping"/>
                        <p>Drop the files here ...</p>
                    </> : 
                    <>
                        <CircleArrowDown className='size-20 animate-bounce'/>
                        <p>Drag 'n' drop some files here, or click to select files</p>
                    </>
                }
            </div>
        </div>)}
        
    </div>
  )
}
export default FileUploader