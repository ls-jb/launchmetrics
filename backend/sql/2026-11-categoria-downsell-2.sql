-- ============================================================
-- Perpétuos: categoria "Downsell 2"
-- ============================================================
-- Recria a constraint de categoria de perpetuos_ofertas incluindo
-- "Downsell 2" (segundo downsell do funil). Mesmo padrão de
-- backend/import/_add_upupsell_categoria_perpetuo.sql. Idempotente.
-- Só amplia os valores aceitos: nenhuma linha existente muda.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_perpetuos_ofertas_categoria'
    ) THEN
        ALTER TABLE launchmetrics.perpetuos_ofertas
            DROP CONSTRAINT ck_perpetuos_ofertas_categoria;
    END IF;

    ALTER TABLE launchmetrics.perpetuos_ofertas
        ADD CONSTRAINT ck_perpetuos_ofertas_categoria
        CHECK (categoria IS NULL OR categoria IN (
            'Principal', 'Order Bump', 'Upsell', 'UpUpsell',
            'Downsell', 'Downsell 2', 'Outros'
        ));
END $$;
