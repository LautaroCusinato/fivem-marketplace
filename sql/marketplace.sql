CREATE TABLE marketplace_ads (
    id INT AUTO_INCREMENT,
    seller_identifier VARCHAR(60),
    seller_name VARCHAR(60),

    item VARCHAR(60),
    label VARCHAR(60),
    amount INT,
    price INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
);