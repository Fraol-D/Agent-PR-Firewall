import Link from "next/link";
import { GitPullRequest } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PullRequestsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Pull requests</h2>
        <p className="text-sm text-muted-foreground">
          Agent PR analyses will list here with risk, scope, and decision
          status.
        </p>
      </div>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <GitPullRequest className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">No pull requests yet</CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                After a repository is connected (Stage 1), opened and
                synchronized PRs appear with historical analysis versions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/dashboard/repositories" />}>
            Connect a repository first
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
