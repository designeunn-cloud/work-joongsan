"use client";
import { createContext } from "react";

export const TaskCompletionContext = createContext<((taskId: string) => void) | null>(null);
