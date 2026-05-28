#!/bin/bash

# Academy LMS - Test Runner
# Ejecuta todas las pruebas del Academy LMS

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           🎓 Academy LMS - Test Runner                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que Bun está instalado
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Error: Bun no está instalado${NC}"
    echo "Instala Bun: https://bun.sh/"
    exit 1
fi

echo "✅ Bun encontrado: $(bun --version)"
echo ""

# Cambiar al directorio del grimoire
cd "$(dirname "$0")/.."

# Verificar dependencias
echo "📦 Verificando dependencias..."
if ! bun pm ls | grep -q "pdfkit"; then
    echo -e "${YELLOW}⚠️  pdfkit no instalado. Instalando...${NC}"
    bun add pdfkit
fi

if ! bun pm ls | grep -q "exceljs"; then
    echo -e "${YELLOW}⚠️  exceljs no instalado. Instalando...${NC}"
    bun add exceljs
fi

echo ""

# Ejecutar pruebas
echo "🧪 Ejecutando pruebas..."
echo ""

# Ejecutar test suite principal
echo "1️⃣  Ejecutando test suite principal..."
bun test tests/academy-lms.test.ts --verbose

TEST_RESULT=$?

echo ""
echo "═══════════════════════════════════════════════════════════════"

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ Todas las pruebas pasaron${NC}"
else
    echo -e "${RED}❌ Algunas pruebas fallaron${NC}"
fi

echo "═══════════════════════════════════════════════════════════════"
echo ""

# Ejecutar validación manual opcional
read -p "¿Ejecutar validación manual? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔍 Ejecutando validación manual..."
    bun tests/manual-test.ts
fi

echo ""
echo "🏁 Test run completed!"
echo ""
