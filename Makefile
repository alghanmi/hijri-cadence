.PHONY: help install check typecheck lint format format-check test dev ical spot-check validate-configs bundle-configs tf-check

CYAN  := \033[0;36m
RED   := \033[0;31m
RESET := \033[0m

WORKER := pnpm --filter @hijri-cadence/worker
TF_MODULE := infrastructure/terraform/_modules/hijri-cadence-environment

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(CYAN)%-18s$(RESET) %s\n", $$1, $$2}'

install: ## Install workspace dependencies (frozen lockfile)
	@pnpm install --frozen-lockfile

check: typecheck lint format-check test ## Everything CI gates on: typecheck, lint, format, Tier 1 tests

typecheck: ## TypeScript type check
	@$(WORKER) typecheck

lint: ## ESLint
	@$(WORKER) lint

format: ## Rewrite files with Prettier
	@pnpm format

format-check: ## Verify Prettier formatting
	@pnpm format:check

test: ## Tier 1 unit tests (no network)
	@$(WORKER) test

dev: ## Run the Worker locally (wrangler dev; every feed 404s without real configs)
	@$(WORKER) dev

ical: ## Render an .ics from a config to disk — CONFIG=<yaml> OUT=<ics>
	@if [ -z "$(CONFIG)" ] || [ -z "$(OUT)" ]; then \
		echo "$(RED)Usage: make ical CONFIG=examples/events.example.yaml OUT=/tmp/out.ics$(RESET)"; exit 1; \
	fi
	@mkdir -p "$(dir $(abspath $(OUT)))"
	@$(WORKER) -s generate:local --config "$(abspath $(CONFIG))" --out "$(abspath $(OUT))"

spot-check: ## Tier 3: cross-check golden dates against the Aladhan API (network)
	@$(WORKER) -s spot-check

validate-configs: ## Validate a directory of per-person configs — DIR=<path>
	@if [ -z "$(DIR)" ]; then echo "$(RED)Usage: make validate-configs DIR=<path>$(RESET)"; exit 1; fi
	@$(WORKER) -s bundle-configs --dir "$(abspath $(DIR))" --check

bundle-configs: ## Write the deploy bundle — DIR=<path> OUT=<json>
	@if [ -z "$(DIR)" ] || [ -z "$(OUT)" ]; then echo "$(RED)Usage: make bundle-configs DIR=<path> OUT=<file.json>$(RESET)"; exit 1; fi
	@$(WORKER) -s bundle-configs --dir "$(abspath $(DIR))" --out "$(abspath $(OUT))"

tf-check: ## terraform fmt -check + validate on the module (no credentials needed)
	@terraform -chdir=infrastructure/terraform fmt -check -recursive
	@terraform -chdir=$(TF_MODULE) init -backend=false -input=false >/dev/null
	@terraform -chdir=$(TF_MODULE) validate
