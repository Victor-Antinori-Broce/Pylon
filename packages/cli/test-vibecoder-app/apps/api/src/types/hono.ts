// @ts-nocheck
/**
 * Hono Type Definitions
 * 
 * Centralized type definitions for Hono context variables
 */

import type { auth } from "../lib/auth";
import type { AgentAuthContext } from "../services/agent-auth";

/**
 * Variables available in Hono context
 */
export type AppVariables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  requestId: string;
  agent?: AgentAuthContext;
};

// Extend Hono's ContextVariableMap globally
declare module "hono" {
  interface ContextVariableMap extends AppVariables {}
}
