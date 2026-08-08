locals {
  # ── Resource-name prefix ──────────────────────────────────────────────────
  #
  # Every Cloudflare resource in this module derives its name from this
  # prefix, so one account can host N independent instances by supplying
  # different `instance_id` values from different Terraform states.
  prefix      = format("hijri-cadence-%s", var.instance_id)
  worker_name = local.prefix

  # ── Non-secret Worker vars (plain_text bindings) ──────────────────────────
  #
  # INSTANCE_ID lands on every log line as a version-agnostic identifier.
  # HEARTBEAT_URL and HEARTBEAT_URL alike stay empty by default; the Worker
  # code treats empty as "feature disabled" so the Cloudflare API doesn't
  # reject an empty plain_text binding, they get filtered out of the
  # bindings list below.
  worker_vars = {
    INSTANCE_ID   = var.instance_id
    LOG_LEVEL     = var.log_level
    HEARTBEAT_URL = var.heartbeat_url
  }

  required_plain_text = {
    INSTANCE_ID = local.worker_vars.INSTANCE_ID
    LOG_LEVEL   = local.worker_vars.LOG_LEVEL
  }

  optional_plain_text = {
    HEARTBEAT_URL = local.worker_vars.HEARTBEAT_URL
  }

  # ── Placeholder script written on first apply ─────────────────────────────
  #
  # Replaced by `wrangler deploy` immediately after Terraform provisions the
  # script resource. `lifecycle.ignore_changes = [content, main_module]`
  # keeps Terraform from reverting the wrangler-uploaded bundle on later
  # applies.
  placeholder_script = <<-EOT
    export default {
      async fetch(_req, _env, _ctx) {
        return new Response("placeholder — replaced by wrangler deploy", { status: 503 });
      },
      async scheduled(_event, _env, _ctx) {
        console.log("placeholder — replaced by wrangler deploy");
      },
    };
  EOT
}
