import { createContext, useContext } from "react";

interface LevelContextValue {
  level: string;
  setLevel: (level: string) => void;
}

export const LevelContext = createContext<LevelContextValue>({
  level: "a1",
  setLevel: () => {},
});

export const useLevel = () => useContext(LevelContext);
