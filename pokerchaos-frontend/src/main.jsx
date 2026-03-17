import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/react";
import App from "./App.jsx";
import { setAuthTokenFetcher } from "./lib/api.js";
import "./styles.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function AuthSync({ children }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthTokenFetcher(() => getToken());
    } else {
      setAuthTokenFetcher(null);
    }
  }, [getToken, isLoaded, isSignedIn]);

  if (!isLoaded) return null;
  return children;
}

function Shell() {
  if (!clerkPublishableKey) {
    return (
      <div className="auth-gate">
        <h1>Poker Chaos Coach</h1>
        <p>Set VITE_CLERK_PUBLISHABLE_KEY to enable login.</p>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <Show when="signed-in">
        <AuthSync>
          <div className="auth-bar">
            <UserButton />
          </div>
          <App />
        </AuthSync>
      </Show>
      <Show when="signed-out">
        <div className="auth-gate">
          <h1>Poker Chaos Coach</h1>
          <p>Sign in to access the app.</p>
          <div className="auth-actions">
            <SignInButton mode="modal">
              <button className="auth-button">Sign In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="auth-button secondary">Create Account</button>
            </SignUpButton>
          </div>
        </div>
      </Show>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>
);
