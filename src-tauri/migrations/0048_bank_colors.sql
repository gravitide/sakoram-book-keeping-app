-- Colour tag per business bank account. One of the 8 predefined
-- THEME_COLORS swatch names (same palette bill categories use); the UI
-- renders it as a small dot in front of the bank identity everywhere
-- (settings list, vouchers list, bank pickers, reconcile) so multiple
-- accounts are recognisable at a glance without reading labels.
ALTER TABLE business_banks ADD COLUMN color TEXT NOT NULL DEFAULT 'green';

-- Auto-assign distinct swatches to existing banks by id order so the
-- markers are useful with zero setup. The WHEN order interleaves hue
-- families — banks 1 and 2 (the common case) land on green vs sky,
-- not two near-identical greens.
UPDATE business_banks SET color = CASE (id % 8)
	WHEN 0 THEN 'red'
	WHEN 1 THEN 'green'
	WHEN 2 THEN 'sky'
	WHEN 3 THEN 'amber'
	WHEN 4 THEN 'violet'
	WHEN 5 THEN 'orange'
	WHEN 6 THEN 'emerald'
	WHEN 7 THEN 'blue'
END;
