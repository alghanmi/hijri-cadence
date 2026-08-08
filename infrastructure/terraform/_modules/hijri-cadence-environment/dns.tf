# ── DNS + custom domain routing ─────────────────────────────────────────────
#
# Cloudflare's "Workers Custom Domain" attaches the Worker to a hostname
# via a single resource — it provisions the SSL cert AND the necessary
# DNS record together. No separate `cloudflare_dns_record` needed.
resource "cloudflare_workers_custom_domain" "hijri_cadence" {
  account_id = var.cloudflare_account_id
  zone_id    = var.zone_id
  hostname   = var.feed_hostname
  service    = cloudflare_workers_script.hijri_cadence.script_name
}
