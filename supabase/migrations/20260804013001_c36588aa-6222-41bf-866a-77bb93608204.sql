WITH parsed AS (
  SELECT o.id,
         string_to_array(o.address_line, ', ') AS parts
  FROM public.orders o
  WHERE o.division IS NULL
    AND o.address_line IS NOT NULL
    AND array_length(string_to_array(o.address_line, ', '), 1) >= 4
)
UPDATE public.orders o
SET division = p.parts[array_length(p.parts,1)],
    district = p.parts[array_length(p.parts,1) - 1],
    upazila  = p.parts[array_length(p.parts,1) - 2],
    address_line = array_to_string(p.parts[1:array_length(p.parts,1) - 3], ', ')
FROM parsed p
WHERE o.id = p.id
  AND EXISTS (
    SELECT 1 FROM public.orders x
    WHERE x.id = o.id
      AND p.parts[array_length(p.parts,1) - 1] = x.city
  );