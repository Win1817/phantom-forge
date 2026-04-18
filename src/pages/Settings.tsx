import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Settings</h1>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-fantasy">Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Email</p>
            <p className="text-sm">{user?.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Planeswalker</p>
            <p className="text-sm">{user?.user_metadata?.display_name ?? "—"}</p>
          </div>
          <Button variant="outline" onClick={signOut} className="border-destructive/40 text-destructive hover:bg-destructive/10">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-fantasy">Preferences</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Currency, language, and API preferences are coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
