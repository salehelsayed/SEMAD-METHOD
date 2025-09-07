#!/bin/bash

# Update all references from bmad-core to semad-core
echo "Updating bmad-core references to semad-core..."

# Update agent files
echo "Updating agent files..."
for file in bmad-core/agents/*.md; do
    if [ -f "$file" ]; then
        echo "  Updating $file"
        sed -i '' 's/\.bmad-core/\.semad-core/g' "$file"
        sed -i '' 's/bmad-core\/utils/semad-core\/utils/g' "$file"
        sed -i '' 's/{root}\/bmad-core/{root}\/semad-core/g' "$file"
        sed -i '' 's/bmad-core\/templates/semad-core\/templates/g' "$file"
        sed -i '' 's/bmad-core\/scripts/semad-core\/scripts/g' "$file"
        sed -i '' 's/bmad-core\/structured/semad-core\/structured/g' "$file"
    fi
done

# Update CLAUDE.md
echo "Updating CLAUDE.md..."
sed -i '' 's/\.bmad-core/\.semad-core/g' CLAUDE.md
sed -i '' 's/bmad-core\//semad-core\//g' CLAUDE.md

# Update structured tasks
echo "Updating structured tasks..."
for file in bmad-core/structured-tasks/*.yaml; do
    if [ -f "$file" ]; then
        if grep -q "\.bmad-core" "$file" 2>/dev/null || grep -q "bmad-core/" "$file" 2>/dev/null; then
            echo "  Updating $file"
            sed -i '' 's/\.bmad-core/\.semad-core/g' "$file"
            sed -i '' 's/bmad-core\//semad-core\//g' "$file"
        fi
    fi
done

# Update utils
echo "Updating utils..."
for file in bmad-core/utils/*.js; do
    if [ -f "$file" ]; then
        if grep -q "\.bmad-core" "$file" 2>/dev/null || grep -q "bmad-core/" "$file" 2>/dev/null; then
            echo "  Updating $file"
            sed -i '' 's/\.bmad-core/\.semad-core/g' "$file"
            sed -i '' 's/bmad-core\//semad-core\//g' "$file"
        fi
    fi
done

# Update tools
echo "Updating tools..."
for file in tools/*.js tools/**/*.js; do
    if [ -f "$file" ]; then
        if grep -q "bmad-core" "$file" 2>/dev/null; then
            echo "  Updating $file"
            sed -i '' 's/bmad-core/semad-core/g' "$file"
        fi
    fi
done

# Update tests
echo "Updating tests..."
for file in tests/*.js tests/**/*.js; do
    if [ -f "$file" ]; then
        if grep -q "bmad-core" "$file" 2>/dev/null; then
            echo "  Updating $file"
            sed -i '' 's/bmad-core/semad-core/g' "$file"
        fi
    fi
done

echo "Done! All references updated from bmad-core to semad-core."
echo ""
echo "Note: The symbolic links are already in place:"
echo "  semad-core -> bmad-core"
echo "  .semad-core -> .bmad-core"