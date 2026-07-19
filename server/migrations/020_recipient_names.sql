UPDATE reimbursements
SET recipient = 'Даня'
WHERE lower(trim(recipient)) IN ('дани', 'даниил');

UPDATE debts
SET recipient = 'Даня'
WHERE lower(trim(recipient)) IN ('дани', 'даниил');
