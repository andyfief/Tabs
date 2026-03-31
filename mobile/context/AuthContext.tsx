import { createContext, useContext } from 'react';

type AuthContextValue = {
  markProfileReady: () => void;
};

export const AuthContext = createContext<AuthContextValue>({
  markProfileReady: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
