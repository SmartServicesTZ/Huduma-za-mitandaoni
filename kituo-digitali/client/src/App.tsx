import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/services"} component={Home} />
      <Route path={"/workbench"} component={Home} />
      <Route path={"/history"} component={Home} />
      <Route path={"/tokens"} component={Home} />
      <Route path={"/account"} component={Home} />
      <Route path={"/admin"} component={Home} />
      <Route path={"/admin/users"} component={Home} />
      <Route path={"/admin/tokens"} component={Home} />
      <Route path={"/admin/services"} component={Home} />
      <Route path={"/admin/videos"} component={Home} />
      <Route path={"/admin/transactions"} component={Home} />
      <Route path={"/admin/announcements"} component={Home} />
      <Route path={"/admin/cms"} component={Home} />
      <Route path={"/admin/licenses"} component={Home} />
      <Route path={"/admin/security"} component={Home} />
      <Route path={"/admin/settings"} component={Home} />
      <Route path={"/admin/roles"} component={Home} />
      <Route path={"/admin/messages"} component={Home} />
      <Route path={"/admin/ads"} component={Home} />
      <Route path={"/admin/analytics"} component={Home} />
      <Route path={"/admin/appearance"} component={Home} />
      <Route path={"/admin/audit"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
