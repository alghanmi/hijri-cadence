output "instance_id" {
  description = "The multi-instance identifier this environment was provisioned for."
  value       = var.instance_id
}

output "prefix" {
  description = "Resource-name prefix (e.g. \"hijri-cadence-alghanmi\")."
  value       = local.prefix
}

output "worker_name" {
  description = "Cloudflare Worker script name."
  value       = cloudflare_workers_script.hijri_cadence.script_name
}

output "feed_hostname" {
  description = "Public hostname the Worker is bound to (e.g. cadence.forklabs.cc)."
  value       = var.feed_hostname
}

output "cron_schedule" {
  description = "Cron expression firing the Worker's scheduled handler."
  value       = var.cron_schedule
}
