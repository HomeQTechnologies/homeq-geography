.PHONY: help clean

INDIVIDUAL_DIR := data/individual

help:
	@echo "Geography data"
	@echo ""
	@echo "  make clean     Remove .json and .geojson files under $(INDIVIDUAL_DIR) (keep .geojson.gz)"

clean:
	@removed=0; \
	while IFS= read -r -d '' file; do \
		rm -f "$$file"; \
		removed=$$((removed + 1)); \
	done < <(find $(INDIVIDUAL_DIR) -type f \( -name '*.json' -o -name '*.geojson' \) -print0); \
	echo "Removed $$removed file(s) under $(INDIVIDUAL_DIR) (.geojson.gz kept)"
