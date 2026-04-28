variable "vercel_project_id" {
  type        = string
  description = "Vercel project ID (found in Project Settings → General)"
}

variable "vercel_team_id" {
  type        = string
  description = "Vercel team ID; null for personal accounts"
  default     = null
}

variable "vercel_api_token" {
  type        = string
  description = "Vercel API token — set via TF_VAR_vercel_api_token or VERCEL_API_TOKEN env var"
  sensitive   = true
}
