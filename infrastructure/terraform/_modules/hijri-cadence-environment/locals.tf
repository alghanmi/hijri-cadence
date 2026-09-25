locals {
  # ── Resource-name prefix ──────────────────────────────────────────────────
  #
  # Every Cloudflare resource in this module derives its name from this
  # prefix, so one account can host N independent instances by supplying
  # different `instance_id` values from different Terraform states.
  prefix      = format("hijri-cadence-%s", var.instance_id)
  worker_name = local.prefix
}
