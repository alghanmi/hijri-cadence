# ── The Worker ──────────────────────────────────────────────────────────────
#
# Ownership split:
#   - Terraform owns the Worker entity, its observability settings, the
#     workers.dev subdomain (off), the custom domain (dns.tf), and the cron
#     trigger. `cloudflare_worker` carries no code, so Terraform never reads
#     or uploads the bundle.
#   - wrangler owns the code, compatibility date/flags (worker/wrangler.toml),
#     and the plain-text vars (INSTANCE_ID, LOG_LEVEL, HEARTBEAT_URL), which
#     the deploy passes with `wrangler deploy --var`.
resource "cloudflare_worker" "hijri_cadence" {
  account_id = var.cloudflare_account_id
  name       = local.worker_name

  observability = {
    enabled            = true
    head_sampling_rate = 1
    logs = {
      enabled            = true
      head_sampling_rate = 1
      invocation_logs    = true
      persist            = true
    }
    traces = {
      enabled            = false
      head_sampling_rate = 1
      persist            = true
    }
  }

  subdomain = {
    enabled          = false
    previews_enabled = false
  }
}

# Up to v0.1.0 the module managed the Worker as `cloudflare_workers_script`,
# which downloads and parses the uploaded code on every refresh and fails once
# wrangler replaces it. Forget it; never destroy it: destroying that resource
# would delete the live Worker.
removed {
  from = cloudflare_workers_script.hijri_cadence

  lifecycle {
    destroy = false
  }
}

# ── Cron trigger ────────────────────────────────────────────────────────────
#
# Fires the Worker's `scheduled()` handler on `var.cron_schedule`. Handler
# runs the golden-vector self-check + pings Healthchecks.io on success.
# `var.cron_enabled = false` empties `schedules` so invocations stop
# without destroying the resource.
resource "cloudflare_workers_cron_trigger" "hijri_cadence" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_worker.hijri_cadence.name
  schedules   = var.cron_enabled ? [{ cron = var.cron_schedule }] : []
}
