-- =============================================================================
--  OLAP & APEX Training — Projet fil rouge
--  Schéma en étoile « ventes d'une enseigne de cycles » + données générées
--
--  Où l'exécuter : APEX > SQL Workshop > SQL Scripts > Upload > Run
--                  (ou SQL Developer / SQLcl, connecté au schéma du workspace)
--  Compatible   : Oracle Database 12c et plus (identity, FETCH FIRST), 19c, 23ai
--  Attention    : le script SUPPRIME puis recrée les objets listés ci-dessous
--                 s'ils existent déjà dans le schéma.
--
--  Objets créés : DIM_TEMPS, DIM_PRODUIT, DIM_MAGASIN, FAIT_VENTES,
--                 OBJECTIFS_VENTES, DROITS_REGION, V_VENTES_DETAIL
-- =============================================================================

-- 0. Nettoyage (le script peut être relancé) -----------------------------------
BEGIN
  FOR o IN (SELECT object_name, object_type
            FROM   user_objects
            WHERE  object_type IN ('VIEW', 'TABLE')
            AND    object_name IN ('V_VENTES_DETAIL', 'FAIT_VENTES', 'OBJECTIFS_VENTES',
                                   'DROITS_REGION', 'DIM_PRODUIT', 'DIM_MAGASIN', 'DIM_TEMPS')
            ORDER  BY CASE object_type WHEN 'VIEW' THEN 0 ELSE 1 END)
  LOOP
    EXECUTE IMMEDIATE 'DROP ' || o.object_type || ' ' || o.object_name ||
                      CASE WHEN o.object_type = 'TABLE' THEN ' CASCADE CONSTRAINTS PURGE' END;
  END LOOP;
END;
/

-- 1. Dimension Temps ----------------------------------------------------------
CREATE TABLE dim_temps (
  date_key      NUMBER(8)     CONSTRAINT pk_dim_temps PRIMARY KEY,   -- AAAAMMJJ
  date_jour     DATE          NOT NULL,
  jour_semaine  VARCHAR2(12)  NOT NULL,
  semaine_iso   NUMBER(2)     NOT NULL,
  mois_key      NUMBER(6)     NOT NULL,                              -- AAAAMM
  mois_num      NUMBER(2)     NOT NULL,
  mois_libelle  VARCHAR2(12)  NOT NULL,
  trimestre     VARCHAR2(2)   NOT NULL,                              -- T1..T4
  annee         NUMBER(4)     NOT NULL,
  est_ferie     CHAR(1)       DEFAULT 'N' NOT NULL
);

INSERT INTO dim_temps (date_key, date_jour, jour_semaine, semaine_iso, mois_key,
                       mois_num, mois_libelle, trimestre, annee)
SELECT TO_NUMBER(TO_CHAR(d, 'YYYYMMDD')),
       d,
       INITCAP(TO_CHAR(d, 'fmDay', 'NLS_DATE_LANGUAGE=FRENCH')),
       TO_NUMBER(TO_CHAR(d, 'IW')),
       TO_NUMBER(TO_CHAR(d, 'YYYYMM')),
       EXTRACT(MONTH FROM d),
       INITCAP(TO_CHAR(d, 'fmMonth', 'NLS_DATE_LANGUAGE=FRENCH')),
       'T' || TO_CHAR(d, 'Q'),
       EXTRACT(YEAR FROM d)
FROM  (SELECT DATE '2023-01-01' + LEVEL - 1 AS d
       FROM   dual
       CONNECT BY LEVEL <= DATE '2027-01-01' - DATE '2023-01-01');

-- Jours fériés fixes (France)
UPDATE dim_temps
SET    est_ferie = 'O'
WHERE  TO_CHAR(date_jour, 'MM-DD') IN ('01-01', '05-01', '05-08', '07-14',
                                       '08-15', '11-01', '11-11', '12-25');

-- 2. Dimension Produit (colonnes SCD 2 prêtes à l'emploi) -----------------------
CREATE TABLE dim_produit (
  produit_key     NUMBER        CONSTRAINT pk_dim_produit PRIMARY KEY,
  code_produit    VARCHAR2(20)  NOT NULL,                  -- clé naturelle
  libelle         VARCHAR2(100) NOT NULL,
  marque          VARCHAR2(50)  NOT NULL,
  sous_categorie  VARCHAR2(50)  NOT NULL,
  categorie       VARCHAR2(50)  NOT NULL,
  prix_catalogue  NUMBER(10,2)  NOT NULL,
  cout_unitaire   NUMBER(10,2)  NOT NULL,
  date_debut      DATE          DEFAULT DATE '2000-01-01' NOT NULL,
  date_fin        DATE          DEFAULT DATE '9999-12-31' NOT NULL,
  est_courant     CHAR(1)       DEFAULT 'O' NOT NULL
);

INSERT ALL
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 1, 'SKU-1001', 'Vélo route Aero 500',        'Orbis',    'Route',       'Vélos',       1299, 850)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 2, 'SKU-1002', 'Vélo route Endurance 300',   'Orbis',    'Route',       'Vélos',        899, 590)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 3, 'SKU-1003', 'VTT Trail 29',               'TrailCo',  'VTT',         'Vélos',       1099, 720)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 4, 'SKU-1004', 'VTT Rando 27.5',             'TrailCo',  'VTT',         'Vélos',        649, 420)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 5, 'SKU-1005', 'Vélo ville Classic',         'Urbano',   'Ville',       'Vélos',        449, 290)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 6, 'SKU-1006', 'Vélo pliant Compact',        'Urbano',   'Ville',       'Vélos',        549, 360)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 7, 'SKU-2001', 'VAE Ville Confort',          'Voltra',   'VAE Ville',   'VAE',         2499, 1700)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 8, 'SKU-2002', 'VAE Ville Speed 45',         'Voltra',   'VAE Ville',   'VAE',         2999, 2050)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES ( 9, 'SKU-2003', 'VTTAE Trail',                'TrailCo',  'VAE VTT',     'VAE',         3899, 2700)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (10, 'SKU-2004', 'VTTAE Rando',                'TrailCo',  'VAE VTT',     'VAE',         2799, 1950)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (11, 'SKU-2005', 'Cargo Famille',              'Voltra',   'VAE Cargo',   'VAE',         4299, 3000)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (12, 'SKU-2006', 'Cargo Compact',              'Voltra',   'VAE Cargo',   'VAE',         3499, 2450)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (13, 'SKU-3001', 'Casque urbain',              'Protec',   'Sécurité',    'Accessoires',   59,   28)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (14, 'SKU-3002', 'Casque VTT',                 'Protec',   'Sécurité',    'Accessoires',   89,   42)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (15, 'SKU-3003', 'Antivol U',                  'Protec',   'Sécurité',    'Accessoires',   49,   22)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (16, 'SKU-3004', 'Éclairage LED avant/arrière','Lumo',     'Équipement',  'Accessoires',   35,   14)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (17, 'SKU-3005', 'Kit entretien chaîne',       'Lumo',     'Entretien',   'Accessoires',   25,    9)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (18, 'SKU-3006', 'Pompe à pied',               'Lumo',     'Entretien',   'Accessoires',   29,   12)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (19, 'SKU-4001', 'Maillot manches courtes',    'Rouleur',  'Hauts',       'Vêtements',     45,   18)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (20, 'SKU-4002', 'Veste de pluie',             'Rouleur',  'Hauts',       'Vêtements',     89,   38)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (21, 'SKU-4003', 'Cuissard',                   'Rouleur',  'Bas',         'Vêtements',     69,   28)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (22, 'SKU-4004', 'Pantalon vélotaf',           'Rouleur',  'Bas',         'Vêtements',     59,   24)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (23, 'SKU-4005', 'Chaussures VTT',             'TrailCo',  'Chaussures',  'Vêtements',    119,   55)
  INTO dim_produit (produit_key, code_produit, libelle, marque, sous_categorie, categorie, prix_catalogue, cout_unitaire) VALUES (24, 'SKU-4006', 'Gants été',                  'Rouleur',  'Hauts',       'Vêtements',     25,    9)
SELECT * FROM dual;

-- 3. Dimension Magasin ---------------------------------------------------------
CREATE TABLE dim_magasin (
  magasin_key     NUMBER        CONSTRAINT pk_dim_magasin PRIMARY KEY,
  code_magasin    VARCHAR2(10)  NOT NULL,
  nom             VARCHAR2(100) NOT NULL,
  ville           VARCHAR2(60)  NOT NULL,
  departement     VARCHAR2(60)  NOT NULL,
  region          VARCHAR2(60)  NOT NULL,
  pays            VARCHAR2(30)  DEFAULT 'France' NOT NULL,
  surface_m2      NUMBER(6)     NOT NULL,
  type_magasin    VARCHAR2(20)  NOT NULL,
  date_ouverture  DATE          NOT NULL
);

INSERT ALL
  INTO dim_magasin VALUES ( 1, 'MAG-01', 'Paris Bastille',      'Paris',       'Paris',              'Île-de-France',        'France', 900, 'Centre-ville', DATE '2012-04-02')
  INTO dim_magasin VALUES ( 2, 'MAG-02', 'Paris Montparnasse',  'Paris',       'Paris',              'Île-de-France',        'France', 650, 'Centre-ville', DATE '2016-09-12')
  INTO dim_magasin VALUES ( 3, 'MAG-03', 'Versailles',          'Versailles',  'Yvelines',           'Île-de-France',        'France', 480, 'Périphérie',   DATE '2019-03-04')
  INTO dim_magasin VALUES ( 4, 'MAG-04', 'Lyon Part-Dieu',      'Lyon',        'Rhône',              'Auvergne-Rhône-Alpes', 'France', 880, 'Centre-ville', DATE '2013-05-21')
  INTO dim_magasin VALUES ( 5, 'MAG-05', 'Grenoble',            'Grenoble',    'Isère',              'Auvergne-Rhône-Alpes', 'France', 600, 'Périphérie',   DATE '2017-02-06')
  INTO dim_magasin VALUES ( 6, 'MAG-06', 'Annecy',              'Annecy',      'Haute-Savoie',       'Auvergne-Rhône-Alpes', 'France', 450, 'Centre-ville', DATE '2020-06-15')
  INTO dim_magasin VALUES ( 7, 'MAG-07', 'Toulouse Capitole',   'Toulouse',    'Haute-Garonne',      'Occitanie',            'France', 820, 'Centre-ville', DATE '2014-10-01')
  INTO dim_magasin VALUES ( 8, 'MAG-08', 'Montpellier',         'Montpellier', 'Hérault',            'Occitanie',            'France', 640, 'Périphérie',   DATE '2018-04-09')
  INTO dim_magasin VALUES ( 9, 'MAG-09', 'Nîmes',               'Nîmes',       'Gard',               'Occitanie',            'France', 420, 'Périphérie',   DATE '2021-09-01')
  INTO dim_magasin VALUES (10, 'MAG-10', 'Bordeaux Chartrons',  'Bordeaux',    'Gironde',            'Nouvelle-Aquitaine',   'France', 760, 'Centre-ville', DATE '2015-03-16')
  INTO dim_magasin VALUES (11, 'MAG-11', 'La Rochelle',         'La Rochelle', 'Charente-Maritime',  'Nouvelle-Aquitaine',   'France', 520, 'Centre-ville', DATE '2019-05-20')
  INTO dim_magasin VALUES (12, 'MAG-12', 'Biarritz',            'Biarritz',    'Pyrénées-Atlantiques','Nouvelle-Aquitaine',  'France', 430, 'Centre-ville', DATE '2022-04-04')
SELECT * FROM dual;

-- 4. Table de faits (grain : une ligne = un produit sur un ticket de caisse) ----
CREATE TABLE fait_ventes (
  date_key     NUMBER(8)     NOT NULL CONSTRAINT fk_ventes_temps   REFERENCES dim_temps(date_key),
  produit_key  NUMBER        NOT NULL CONSTRAINT fk_ventes_produit REFERENCES dim_produit(produit_key),
  magasin_key  NUMBER        NOT NULL CONSTRAINT fk_ventes_magasin REFERENCES dim_magasin(magasin_key),
  num_ticket   VARCHAR2(20)  NOT NULL,                     -- dimension dégénérée
  quantite     NUMBER(6)     NOT NULL,
  montant_ht   NUMBER(12,2)  NOT NULL,
  marge        NUMBER(12,2)  NOT NULL
);

-- Génération reproductible (graine fixe) : saisonnalité, jour de semaine,
-- croissance annuelle, taille des magasins, montée en puissance des VAE.
DECLARE
  TYPE t_num IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  l_prix     t_num;
  l_cout     t_num;
  l_saison   t_num;
  l_date     DATE := DATE '2023-01-01';
  l_fin      DATE := LEAST(TRUNC(SYSDATE) - 1, DATE '2026-12-31');
  l_seq      PLS_INTEGER := 0;
  l_lambda   NUMBER;
  l_nb_tk    PLS_INTEGER;
  l_nb_lg    PLS_INTEGER;
  l_prod     PLS_INTEGER;
  l_qte      PLS_INTEGER;
  l_r        NUMBER;
  l_part_vae NUMBER;
  l_remise   NUMBER;
  l_montant  NUMBER;
  l_jour     VARCHAR2(3);
  l_coef_j   NUMBER;
  l_croiss   NUMBER;
  l_dk       NUMBER;
  l_ticket   VARCHAR2(20);
BEGIN
  DBMS_RANDOM.SEED(42);

  FOR p IN (SELECT produit_key, prix_catalogue, cout_unitaire FROM dim_produit) LOOP
    l_prix(p.produit_key) := p.prix_catalogue;
    l_cout(p.produit_key) := p.cout_unitaire;
  END LOOP;

  -- Coefficients saisonniers par mois (printemps/été forts, pic de décembre)
  l_saison(1) := 0.55; l_saison(2) := 0.60; l_saison(3) := 0.85; l_saison(4)  := 1.10;
  l_saison(5) := 1.30; l_saison(6) := 1.35; l_saison(7) := 1.25; l_saison(8)  := 1.00;
  l_saison(9) := 0.95; l_saison(10):= 0.80; l_saison(11):= 0.70; l_saison(12) := 1.05;

  WHILE l_date <= l_fin LOOP
    l_jour := TO_CHAR(l_date, 'DY', 'NLS_DATE_LANGUAGE=AMERICAN');
    IF l_jour <> 'SUN'
       AND TO_CHAR(l_date, 'MM-DD') NOT IN ('01-01', '05-01', '12-25') THEN

      l_coef_j   := CASE l_jour WHEN 'SAT' THEN 1.6 WHEN 'MON' THEN 0.7 ELSE 1 END;
      l_croiss   := CASE EXTRACT(YEAR FROM l_date)
                      WHEN 2023 THEN 1.00 WHEN 2024 THEN 1.06
                      WHEN 2025 THEN 1.13 ELSE 1.18 END;
      l_part_vae := 0.10 + 0.03 * (EXTRACT(YEAR FROM l_date) - 2023);
      l_dk       := TO_NUMBER(TO_CHAR(l_date, 'YYYYMMDD'));

      FOR m IN (SELECT magasin_key, surface_m2 FROM dim_magasin) LOOP
        l_lambda := 2.2 * l_saison(EXTRACT(MONTH FROM l_date)) * l_coef_j * l_croiss * (m.surface_m2 / 600);
        l_nb_tk  := TRUNC(DBMS_RANDOM.VALUE(0, 2 * l_lambda + 1));

        FOR t IN 1 .. l_nb_tk LOOP
          l_seq    := l_seq + 1;
          l_ticket := 'T' || LPAD(m.magasin_key, 2, '0') || '-' || LPAD(l_seq, 7, '0');
          l_r      := DBMS_RANDOM.VALUE;
          l_nb_lg  := 1 + CASE WHEN l_r < 0.45 THEN 1 ELSE 0 END + CASE WHEN l_r < 0.15 THEN 1 ELSE 0 END;

          FOR lg IN 1 .. l_nb_lg LOOP
            l_r := DBMS_RANDOM.VALUE;
            IF    l_r < 0.22              THEN l_prod := 1  + TRUNC(DBMS_RANDOM.VALUE(0, 6)); l_qte := 1;   -- Vélos
            ELSIF l_r < 0.22 + l_part_vae THEN l_prod := 7  + TRUNC(DBMS_RANDOM.VALUE(0, 6)); l_qte := 1;   -- VAE
            ELSIF l_r < 0.72              THEN l_prod := 13 + TRUNC(DBMS_RANDOM.VALUE(0, 6)); l_qte := 1 + TRUNC(DBMS_RANDOM.VALUE(0, 3));
            ELSE                               l_prod := 19 + TRUNC(DBMS_RANDOM.VALUE(0, 6)); l_qte := 1 + TRUNC(DBMS_RANDOM.VALUE(0, 2));
            END IF;

            -- Soldes en janvier et juillet, remises ponctuelles le reste de l'année
            l_remise := CASE
                          WHEN EXTRACT(MONTH FROM l_date) IN (1, 7) AND DBMS_RANDOM.VALUE < 0.5 THEN 0.20
                          WHEN DBMS_RANDOM.VALUE < 0.10 THEN 0.10
                          ELSE 0 END;
            l_montant := ROUND(l_qte * l_prix(l_prod) * (1 - l_remise), 2);

            INSERT INTO fait_ventes (date_key, produit_key, magasin_key, num_ticket, quantite, montant_ht, marge)
            VALUES (l_dk, l_prod, m.magasin_key, l_ticket, l_qte, l_montant,
                    l_montant - l_qte * l_cout(l_prod));
          END LOOP;
        END LOOP;
      END LOOP;
    END IF;
    l_date := l_date + 1;
  END LOOP;
  COMMIT;
END;
/

CREATE INDEX ix_ventes_date    ON fait_ventes(date_key);
CREATE INDEX ix_ventes_produit ON fait_ventes(produit_key);
CREATE INDEX ix_ventes_magasin ON fait_ventes(magasin_key);

BEGIN
  DBMS_STATS.GATHER_TABLE_STATS(ownname => USER, tabname => 'FAIT_VENTES');
END;
/

-- 5. Tables applicatives (notions APEX 5, 7 et 8) -------------------------------
CREATE TABLE objectifs_ventes (
  objectif_id  NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY CONSTRAINT pk_objectifs PRIMARY KEY,
  magasin_key  NUMBER        NOT NULL CONSTRAINT fk_obj_magasin REFERENCES dim_magasin(magasin_key),
  mois_key     NUMBER(6)     NOT NULL,                     -- AAAAMM
  montant      NUMBER(12,2)  NOT NULL CONSTRAINT ck_obj_montant CHECK (montant >= 0),
  modifie_par  VARCHAR2(100),
  modifie_le   DATE,
  CONSTRAINT uk_objectifs UNIQUE (magasin_key, mois_key)
);

-- Objectifs 2026 = CA 2025 du même mois + 5 %
INSERT INTO objectifs_ventes (magasin_key, mois_key, montant, modifie_par, modifie_le)
SELECT f.magasin_key,
       202600 + t.mois_num,
       ROUND(SUM(f.montant_ht) * 1.05, -2),
       'SCRIPT', SYSDATE
FROM   fait_ventes f
JOIN   dim_temps t ON t.date_key = f.date_key
WHERE  t.annee = 2025
GROUP  BY f.magasin_key, t.mois_num;

CREATE TABLE droits_region (
  login   VARCHAR2(100) NOT NULL,
  region  VARCHAR2(60)  NOT NULL,                          -- '*' = toutes les régions
  CONSTRAINT pk_droits_region PRIMARY KEY (login, region)
);
-- À adapter : remplacez par vos identifiants APEX (en majuscules)
INSERT INTO droits_region VALUES ('ADMIN',        '*');
INSERT INTO droits_region VALUES ('DIR_OCCITANIE', 'Occitanie');
COMMIT;

-- 6. Vue « aplatie » pour les rapports interactifs (notion APEX 3) --------------
CREATE OR REPLACE VIEW v_ventes_detail AS
SELECT t.date_jour      AS "Date",
       t.annee          AS "Année",
       t.trimestre      AS "Trimestre",
       t.mois_num       AS "N° mois",
       t.mois_libelle   AS "Mois",
       m.region         AS "Région",
       m.nom            AS "Magasin",
       p.categorie      AS "Catégorie",
       p.sous_categorie AS "Sous-catégorie",
       p.libelle        AS "Produit",
       f.num_ticket     AS "Ticket",
       f.quantite       AS "Quantité",
       f.montant_ht     AS "CA HT",
       f.marge          AS "Marge"
FROM   fait_ventes f
JOIN   dim_temps   t ON t.date_key    = f.date_key
JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
JOIN   dim_produit p ON p.produit_key = f.produit_key;

-- 7. Vérifications rapides ------------------------------------------------------
SELECT COUNT(*) AS nb_lignes_faits, COUNT(DISTINCT num_ticket) AS nb_tickets FROM fait_ventes;

SELECT t.annee, ROUND(SUM(f.montant_ht)) AS ca_ht, ROUND(100 * SUM(f.marge) / SUM(f.montant_ht), 1) AS taux_marge
FROM   fait_ventes f JOIN dim_temps t ON t.date_key = f.date_key
GROUP  BY t.annee
ORDER  BY t.annee;

-- 8. Requêtes d'entraînement (partie OLAP) ---------------------------------------
-- a) Sous-totaux par région et catégorie
SELECT CASE WHEN GROUPING(m.region) = 1 THEN 'TOTAL' ELSE m.region END AS region,
       CASE WHEN GROUPING(m.region) = 1 THEN NULL
            WHEN GROUPING(p.categorie) = 1 THEN 'Total ' || m.region
            ELSE p.categorie END AS categorie,
       ROUND(SUM(f.montant_ht)) AS ca
FROM   fait_ventes f
JOIN   dim_temps   t ON t.date_key    = f.date_key
JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
JOIN   dim_produit p ON p.produit_key = f.produit_key
WHERE  t.annee = 2025
GROUP  BY ROLLUP (m.region, p.categorie)
ORDER  BY GROUPING(m.region), m.region, GROUPING(p.categorie), p.categorie;

-- b) Mois 2025 : cumul, N-1, moyenne mobile
SELECT annee, mois_num, ca,
       SUM(ca) OVER (PARTITION BY annee ORDER BY mois_num ROWS UNBOUNDED PRECEDING) AS cumul,
       LAG(ca) OVER (PARTITION BY mois_num ORDER BY annee)                          AS ca_n_1,
       ROUND(AVG(ca) OVER (ORDER BY annee, mois_num ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)) AS moy_mobile_3m
FROM  (SELECT t.annee, t.mois_num, ROUND(SUM(f.montant_ht)) AS ca
       FROM   fait_ventes f JOIN dim_temps t ON t.date_key = f.date_key
       GROUP  BY t.annee, t.mois_num)
ORDER  BY annee, mois_num;
