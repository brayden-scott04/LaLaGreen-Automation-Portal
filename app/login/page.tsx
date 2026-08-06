import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Card className="border-border p-8 shadow-sm">
          <CardHeader className="px-0 pb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              ShopLaLa
              <sup className="ml-0.5 text-xs font-normal">&reg;</sup>
            </h1>
            <p className="text-sm text-muted-foreground">Automation Portal</p>
          </CardHeader>
          <CardContent className="px-0">
            <LoginForm />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Internal tool — ShopLaLa team only
        </p>
      </div>
    </div>
  );
}
