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
  value       = cloudflare_worker.hijri_cadence.name
}

output "feed_hostname" {
  description = "Public hostname the Worker's custom domain serves (e.g. cadence.example.com)."
  value       = cloudflare_workers_custom_domain.hijri_cadence.hostname
}

output "cron_schedules" {
  description = "Cron expressions currently attached to the Worker (empty when cron_enabled = false)."
  value       = [for s in cloudflare_workers_cron_trigger.hijri_cadence.schedules : s.cron]
}
