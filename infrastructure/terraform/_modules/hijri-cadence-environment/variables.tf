variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Worker + route."
  type        = string
}

variable "instance_id" {
  description = "Multi-instance identifier — becomes the prefix for the Worker script name (e.g. \"alghanmi\" → \"hijri-cadence-alghanmi\"). A single Cloudflare account can host N independent instances."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.instance_id)) && length(var.instance_id) <= 32
    error_message = "instance_id must match ^[a-z0-9-]+$ and be at most 32 characters."
  }
}

variable "zone_id" {
  description = "Cloudflare zone ID for the domain that hosts the feed (e.g. the zone containing cadence.example.com)."
  type        = string
}

variable "feed_hostname" {
  description = "Public hostname the ICS feed is served from (e.g. \"cadence.example.com\"). A DNS record for this name is created on var.zone_id and routed to the Worker."
  type        = string
}

variable "log_level" {
  description = "Worker log level: debug, info, warn, or error."
  type        = string
  default     = "info"

  validation {
    condition     = contains(["debug", "info", "warn", "error"], var.log_level)
    error_message = "log_level must be one of: debug, info, warn, error."
  }
}

variable "heartbeat_url" {
  description = "Healthchecks.io ping URL — pinged by the Worker's Cron Trigger after the golden-vector self-check passes. Empty disables the heartbeat."
  type        = string
  default     = ""
}

variable "cron_schedule" {
  description = "Cron expression for the Worker's scheduled handler (self-check + heartbeat)."
  type        = string
  default     = "0 */6 * * *"
}

variable "cron_enabled" {
  description = "Whether to create the Worker's cron trigger. Setting to false stops scheduled invocations without destroying the resource."
  type        = bool
  default     = true
}

variable "compatibility_date" {
  description = "Workers runtime compatibility date. Keep in sync with compatibility_date in worker/wrangler.toml — wrangler deploy pushes that value too, and a mismatch shows up as plan drift."
  type        = string
  default     = "2026-08-15"

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", var.compatibility_date))
    error_message = "compatibility_date must be YYYY-MM-DD."
  }
}
