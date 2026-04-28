terraform {
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
    yamldecode = {}
  }
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id
}

locals {
  environments = yamldecode(file("${path.root}/../deployment/environments.yml"))

  target_map = {
    production = "production"
    staging    = "preview"
    preview    = "preview"
  }

  env_vars = merge([
    for env in local.environments.active : {
      for k, v in yamldecode(file("${path.root}/../deployment/${env}.yml")) :
      "${env}:${k}" => {
        key    = k
        value  = v
        target = local.target_map[env]
      }
      if v != null && v != ""
    }
  ]...)
}

resource "vercel_project_environment_variable" "vars" {
  for_each = local.env_vars

  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = each.value.key
  value      = each.value.value
  target     = [each.value.target]
}
