'use client'

import {
    UserButton
} from "@clerk/nextjs";

export const Clerk = () => {
  return (
    <div className="flex items-center gap-2">
        <UserButton />
    </div>
  );
};

