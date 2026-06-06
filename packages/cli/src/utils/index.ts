// Utility functions for Gremius CLI
import { execSync } from "child_process";
import path from "path";

import fs from "fs-extra";

export async function checkDocker(): Promise<boolean> {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function checkDockerCompose(): Promise<boolean> {
  try {
    execSync("docker compose version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function isGremiusProject(dir: string): Promise<boolean> {
  const hasDockerCompose = await fs.pathExists(path.join(dir, "docker-compose.yml"));
  const hasGremiusConfig = await fs.pathExists(path.join(dir, "gremius.config.ts"));
  return hasDockerCompose || hasGremiusConfig;
}

export function getProjectName(dir: string): string {
  try {
    const packageJson = fs.readJsonSync(path.join(dir, "package.json"));
    return packageJson.name || "gremius-project";
  } catch {
    return path.basename(dir);
  }
}
