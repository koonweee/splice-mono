import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the category_entity table with Plaid's personal_finance_category taxonomy.
 * Uses ON CONFLICT to be idempotent - safe to run multiple times.
 */
export class SeedCategories1765600000000 implements MigrationInterface {
  name = 'SeedCategories1765600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add a unique constraint on (primary, detailed) to support idempotent seeding
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD CONSTRAINT "UQ_category_primary_detailed" UNIQUE ("primary", "detailed")`,
    );

    await queryRunner.query(`
      INSERT INTO "category_entity" ("id", "primary", "detailed", "description")
      VALUES
        (gen_random_uuid(), 'INCOME', 'INCOME_DIVIDENDS', 'Dividends from investment accounts'),
        (gen_random_uuid(), 'INCOME', 'INCOME_INTEREST_EARNED', 'Income from interest on savings accounts'),
        (gen_random_uuid(), 'INCOME', 'INCOME_RETIREMENT_PENSION', 'Income from pension payments'),
        (gen_random_uuid(), 'INCOME', 'INCOME_TAX_REFUND', 'Income from tax refunds'),
        (gen_random_uuid(), 'INCOME', 'INCOME_UNEMPLOYMENT', 'Income from unemployment benefits, including unemployment insurance and healthcare'),
        (gen_random_uuid(), 'INCOME', 'INCOME_WAGES', 'Income from salaries, gig-economy work, and tips earned'),
        (gen_random_uuid(), 'INCOME', 'INCOME_OTHER_INCOME', 'Other miscellaneous income, including alimony, social security, child support, and rental'),

        (gen_random_uuid(), 'TRANSFER_IN', 'TRANSFER_IN_CASH_ADVANCES_AND_LOANS', 'Loans and cash advances deposited into a bank account'),
        (gen_random_uuid(), 'TRANSFER_IN', 'TRANSFER_IN_DEPOSIT', 'Cash, checks, and ATM deposits into a bank account'),
        (gen_random_uuid(), 'TRANSFER_IN', 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS', 'Inbound transfers to an investment or retirement account'),
        (gen_random_uuid(), 'TRANSFER_IN', 'TRANSFER_IN_SAVINGS', 'Inbound transfers to a savings account'),
        (gen_random_uuid(), 'TRANSFER_IN', 'TRANSFER_IN_ACCOUNT_TRANSFER', 'General inbound transfers from another account'),
        (gen_random_uuid(), 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Other miscellaneous inbound transactions'),

        (gen_random_uuid(), 'TRANSFER_OUT', 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'Transfers to an investment or retirement account, including investment apps such as Acorns, Betterment'),
        (gen_random_uuid(), 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS', 'Outbound transfers to savings accounts'),
        (gen_random_uuid(), 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL', 'Withdrawals from a bank account'),
        (gen_random_uuid(), 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'General outbound transfers to another account'),
        (gen_random_uuid(), 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Other miscellaneous outbound transactions'),

        (gen_random_uuid(), 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT', 'Car loans and leases'),
        (gen_random_uuid(), 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'Payments to a credit card'),
        (gen_random_uuid(), 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT', 'Personal loans, including cash advances and buy now pay later repayments'),
        (gen_random_uuid(), 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_MORTGAGE_PAYMENT', 'Payments on mortgages'),
        (gen_random_uuid(), 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT', 'Payments on student loans'),
        (gen_random_uuid(), 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_OTHER_PAYMENT', 'Other miscellaneous debt payments'),

        (gen_random_uuid(), 'BANK_FEES', 'BANK_FEES_ATM_FEES', 'Fees incurred for out-of-network ATMs'),
        (gen_random_uuid(), 'BANK_FEES', 'BANK_FEES_FOREIGN_TRANSACTION_FEES', 'Fees incurred on non-domestic transactions'),
        (gen_random_uuid(), 'BANK_FEES', 'BANK_FEES_INSUFFICIENT_FUNDS', 'Fees relating to insufficient funds'),
        (gen_random_uuid(), 'BANK_FEES', 'BANK_FEES_INTEREST_CHARGE', 'Fees incurred for interest on purchases'),
        (gen_random_uuid(), 'BANK_FEES', 'BANK_FEES_OVERDRAFT_FEES', 'Fees incurred when an account is in overdraft'),
        (gen_random_uuid(), 'BANK_FEES', 'BANK_FEES_OTHER_BANK_FEES', 'Other miscellaneous bank fees'),

        (gen_random_uuid(), 'ENTERTAINMENT', 'ENTERTAINMENT_CASINOS_AND_GAMBLING', 'Gambling, casinos, and sports betting'),
        (gen_random_uuid(), 'ENTERTAINMENT', 'ENTERTAINMENT_MUSIC_AND_AUDIO', 'Digital and in-person music purchases, including music streaming services'),
        (gen_random_uuid(), 'ENTERTAINMENT', 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS', 'Purchases made at sporting events, music venues, concerts, museums, and amusement parks'),
        (gen_random_uuid(), 'ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES', 'In home movie streaming services and movie theaters'),
        (gen_random_uuid(), 'ENTERTAINMENT', 'ENTERTAINMENT_VIDEO_GAMES', 'Digital and in-person video game purchases'),
        (gen_random_uuid(), 'ENTERTAINMENT', 'ENTERTAINMENT_OTHER_ENTERTAINMENT', 'Other miscellaneous entertainment purchases, including night life and adult entertainment'),

        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR', 'Beer, Wine & Liquor Stores'),
        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE', 'Purchases at coffee shops or cafes'),
        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_FAST_FOOD', 'Dining expenses for fast food chains'),
        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'Purchases for fresh produce and groceries'),
        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT', 'Dining expenses for restaurants, bars, gastropubs, and diners'),
        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_VENDING_MACHINES', 'Purchases made at vending machine operators'),
        (gen_random_uuid(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK', 'Other miscellaneous food and drink, including desserts, juice bars, and delis'),

        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS', 'Books, magazines, and news'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES', 'Apparel, shoes, and jewelry'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CONVENIENCE_STORES', 'Purchases at convenience stores'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_DEPARTMENT_STORES', 'Retail stores with wide ranges of consumer goods'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_DISCOUNT_STORES', 'Stores selling goods at a discounted price'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ELECTRONICS', 'Electronics stores and websites'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', 'Photo, gifts, cards, and floral stores'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES', 'Stores that specialize in office goods'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'Multi-purpose e-commerce platforms such as Etsy, Ebay and Amazon'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_PET_SUPPLIES', 'Pet supplies and pet food'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_SPORTING_GOODS', 'Sporting goods, camping gear, and outdoor equipment'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_SUPERSTORES', 'Superstores such as Target and Walmart'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE', 'Purchases for tobacco and vaping products'),
        (gen_random_uuid(), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE', 'Other miscellaneous merchandise, including toys, hobbies, and arts and crafts'),

        (gen_random_uuid(), 'HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_FURNITURE', 'Furniture, bedding, and home accessories'),
        (gen_random_uuid(), 'HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_HARDWARE', 'Building materials, hardware stores, paint, and wallpaper'),
        (gen_random_uuid(), 'HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE', 'Plumbing, lighting, gardening, and roofing'),
        (gen_random_uuid(), 'HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_SECURITY', 'Home security system purchases'),
        (gen_random_uuid(), 'HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT', 'Other miscellaneous home purchases, including pool installation and pest control'),

        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_DENTAL_CARE', 'Dentists and general dental care'),
        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_EYE_CARE', 'Optometrists, contacts, and glasses stores'),
        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_NURSING_CARE', 'Nursing care and facilities'),
        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', 'Pharmacies and nutrition shops'),
        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_PRIMARY_CARE', 'Doctors and physicians'),
        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_VETERINARY_SERVICES', 'Prevention and care procedures for animals'),
        (gen_random_uuid(), 'MEDICAL', 'MEDICAL_OTHER_MEDICAL', 'Other miscellaneous medical, including blood work, hospitals, and ambulances'),

        (gen_random_uuid(), 'PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS', 'Gyms, fitness centers, and workout classes'),
        (gen_random_uuid(), 'PERSONAL_CARE', 'PERSONAL_CARE_HAIR_AND_BEAUTY', 'Manicures, haircuts, waxing, spa/massages, and bath and beauty products'),
        (gen_random_uuid(), 'PERSONAL_CARE', 'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING', 'Wash and fold, and dry cleaning expenses'),
        (gen_random_uuid(), 'PERSONAL_CARE', 'PERSONAL_CARE_OTHER_PERSONAL_CARE', 'Other miscellaneous personal care, including mental health apps and services'),

        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING', 'Financial planning, and tax and accounting services'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_AUTOMOTIVE', 'Oil changes, car washes, repairs, and towing'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_CHILDCARE', 'Babysitters and daycare'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_CONSULTING_AND_LEGAL', 'Consulting and legal services'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_EDUCATION', 'Elementary, high school, professional schools, and college tuition'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_INSURANCE', 'Insurance for auto, home, and healthcare'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_POSTAGE_AND_SHIPPING', 'Mail, packaging, and shipping services'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_STORAGE', 'Storage services and facilities'),
        (gen_random_uuid(), 'GENERAL_SERVICES', 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES', 'Other miscellaneous services, including advertising and cloud storage'),

        (gen_random_uuid(), 'GOVERNMENT_AND_NON_PROFIT', 'GOVERNMENT_AND_NON_PROFIT_DONATIONS', 'Charitable, political, and religious donations'),
        (gen_random_uuid(), 'GOVERNMENT_AND_NON_PROFIT', 'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES', 'Government departments and agencies'),
        (gen_random_uuid(), 'GOVERNMENT_AND_NON_PROFIT', 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT', 'Tax payments, including income and property taxes'),
        (gen_random_uuid(), 'GOVERNMENT_AND_NON_PROFIT', 'GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT', 'Other miscellaneous government and non-profit agencies'),

        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_BIKES_AND_SCOOTERS', 'Bike and scooter rentals'),
        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_GAS', 'Purchases at a gas station'),
        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_PARKING', 'Parking fees and expenses'),
        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_PUBLIC_TRANSIT', 'Public transportation, including rail and train, buses, and metro'),
        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'Taxi and ride share services'),
        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_TOLLS', 'Toll expenses'),
        (gen_random_uuid(), 'TRANSPORTATION', 'TRANSPORTATION_OTHER_TRANSPORTATION', 'Other miscellaneous transportation expenses'),

        (gen_random_uuid(), 'TRAVEL', 'TRAVEL_FLIGHTS', 'Airline expenses'),
        (gen_random_uuid(), 'TRAVEL', 'TRAVEL_LODGING', 'Hotels, motels, and hosted accommodation such as Airbnb'),
        (gen_random_uuid(), 'TRAVEL', 'TRAVEL_RENTAL_CARS', 'Rental cars, charter buses, and trucks'),
        (gen_random_uuid(), 'TRAVEL', 'TRAVEL_OTHER_TRAVEL', 'Other miscellaneous travel expenses'),

        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', 'Gas and electricity bills'),
        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_INTERNET_AND_CABLE', 'Internet and cable bills'),
        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT', 'Rent payment'),
        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT', 'Sewage and garbage disposal bills'),
        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_TELEPHONE', 'Cell phone bills'),
        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_WATER', 'Water bills'),
        (gen_random_uuid(), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_OTHER_UTILITIES', 'Other miscellaneous utility bills')
      ON CONFLICT ("primary", "detailed") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "category_entity"`);
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP CONSTRAINT "UQ_category_primary_detailed"`,
    );
  }
}
