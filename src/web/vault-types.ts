import type { Environment } from "../shared/api-types.ts";

export interface SelectedFile {
  id: string;
  name: string;
  projectId: string;
  project: string;
  workspace: string;
  environment: Environment | null;
}
