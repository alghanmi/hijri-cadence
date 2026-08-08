# ── The Worker script ───────────────────────────────────────────────────────
#
# Ownership split:
#   - Terraform owns:  bindings (plain_text vars), metadata (compatibility
#                      date + flags), observability config.
#   - wrangler owns:   the JS bundle (`content`) and entry-module name
#                      (`main_module`) — see lifecycle.ignore_changes.
#
# The per-family CONFIGS_JSON blob is NOT a binding — it's a build-time
# `--define` substitution baked into the JS bundle by wrangler at deploy
# time. Provisioning code stops at "here is a Worker script + a route to
# it"; the deploy companion fills in the content.
resource "cloudflare_workers_script" "hijri_cadence" {
  account_id          = var.cloudflare_account_id
  script_name         = local.worker_name
  content             = local.placeholder_script
  main_module         = "worker.js"
  compatibility_date  = "2025-05-01"
  compatibility_flags = ["nodejs_compat"]

  bindings = concat(
    [for k, v in local.required_plain_text : { name = k, type = "plain_text", text = v }],
    [
      for k, v in local.optional_plain_text : { name = k, type = "plain_text", text = v }
      if v != ""
    ],
  )

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

  lifecycle {
    ignore_changes = [
      content,
      main_module,
    ]
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
  script_name = cloudflare_workers_script.hijri_cadence.script_name
  schedules   = var.cron_enabled ? [{ cron = var.cron_schedule }] : []
}
