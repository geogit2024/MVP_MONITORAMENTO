import React, { useEffect } from 'react';
import { Button } from "@/components/ui/button";

export default function Login({ onLogin }) {
  useEffect(() => {
    /* global google */
    window.google.accounts.id.initialize({
      client_id: "1065304033925-8251vu94k6236u3hkqvf1letcrom0t82.apps.googleusercontent.com",
      callback: handleCredentialResponse,
    });
    window.google.accounts.id.renderButton(
      document.getElementById("googleSignInDiv"),
      { theme: "outline", size: "large" }
    );
  }, []);

  const handleCredentialResponse = async (response) => {
    const idToken = response.credential;
    const userInfo = parseJwt(idToken);
    onLogin(idToken, userInfo);
  };

  const parseJwt = (token) => {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="flex flex-col items-center mt-10">
      <h1 className="text-2xl font-bold mb-4">Login com Google</h1>
      <div id="googleSignInDiv"></div>
    </div>
  );
}