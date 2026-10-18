import { useEffect } from "react";
import { authClient } from "../lib/auth";
import SignIn from "./sign-in";
import Workspace from "./workspace";
export default function Entry() {
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    void authClient.managedAuth.handleRedirect();
  }, []);
  if (isPending)
    return (
      <div className="loading-state" dir="rtl">
        جاري تحميل حسابك…
      </div>
    );
  return session ? <Workspace /> : <SignIn />;
}
