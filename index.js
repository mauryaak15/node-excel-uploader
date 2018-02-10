const express = require('express');
const mysql = require('mysql');
const fs = require('fs');
const bodyParser = require('body-parser');
const convertExcel = require('excel-as-json').processFile;
const fileUpload = require('express-fileupload');
const sqlString = require('sqlstring');

const app = express();

const con = mysql.createConnection({
    host: "glowroad-excel-upload.herokuapp.com",
    user: "firstcopy22",
    password: "Ronaldo7",
    database: "firstcopy"
});

con.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
});

app.set('view engine', 'pug');
app.set('views', './views');

app.use(express.static('static'));
app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


app.get('/', (req, res, next) => {
    res.render('index');
});

app.post('/', (req, res, next) => {
    if(req.files) {
        let excelFile = req.files.excelFile;
        if(excelFile.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || excelFile.mimetype == "application/vnd.ms-excel") {
            excelFile.mv('./'+excelFile.name, function(err) {
                if (err)
                  return res.status(500).send(err);
                let options = {
                    sheet: '1',
                    isColOriented: false,
                    omitEmtpyFields: false
                }
                convertExcel('./'+excelFile.name, null, options, (err, data) => {
                    if (err) {
                        res.render('index', {message: {error: true, text: 'Excel file parse error!'}});
                    }else {
                        let finalProducts = [];
                        let productsWithValidSizes = data.filter(obj => obj.Size != ""); //filter out products with invalid sizes
                        let groupedProducts = [];
                        let singleArrayGroupedProducts = [];
                        productsWithValidSizes.forEach((product) => {
                            if(singleArrayGroupedProducts.length) { //check if main products array has product which is already grouped
                                if(singleArrayGroupedProducts.find((obj) => obj['Image Url'] == product['Image Url'])) {
                                    console.log('hhh');
                                    return; //skipping the main product loop iteration
                                }  
                            }
                            let tempGroupedProducts = productsWithValidSizes.filter((prod) => prod['Image Url'] == product['Image Url']); // grouping the same image url products together
                            groupedProducts.push(tempGroupedProducts); //seperate array of grouped products in main array of products
                            singleArrayGroupedProducts.push(...tempGroupedProducts);  // just for keeping track that product is already in grouped array or not
                        });
                        fs.unlink(`./${excelFile.name}`, (err) => {
                            if(err) console.log('Error in removing excel file');
                            else console.log('File removed successfully');
                        });

                        //Making grouped products sizes in format and assigning it to single product then making a final array
                        groupedProducts.forEach((sameProductArray) => {
                            let sizes = [];
                            let stocks = [];
                            for(let {Size} of sameProductArray) {
                                sizes.push(Size);
                                stocks.push(10);
                            }
                            let sizeString = `${sizes.join()};${stocks.join()}`;
                            sameProductArray[0].Size = sizeString;
                            finalProducts.push(sameProductArray[0]);
                        });

                        //Saving products in DB
                        let totalCount = 0;
                        let uploadCount = 0;
                        let totalProd = finalProducts.length;
                        finalProducts.forEach((prod) => {
                            let product_name = (prod['Product Title']) ? prod['Product Title'] : '';
                            let product_image = (prod['Image Url']) ? prod['Image Url'] : '';
                            let product_image2 = '';
                            let product_image3 = '';
                            let product_link = (prod['Product URL']) ? prod['Product URL'] : '';     
                            let price = (prod['Buyer Price']) ? prod['Buyer Price'] : '';
                            let sizes = (prod['Size']) ? prod['Size'] : null;
                            let product_description = (prod['Description']) ? prod['Description'] : '';
                            let category = (prod['Product Category L2']) ? prod['Product Category L2'] : '';
                            let gender = (prod['Product Category L1']) ? ((prod['Product Category L1'].toLowerCase() == "women") ? 'F' : 'M')  : '';
                            let subcategory = 'none';
                            let qc_flag = '0';
                            let cod_flag = '0';
                            let delivery_charge = (prod['Shipping Charge']) ? prod['Shipping Charge'] : '';
                            let cod_charge = '0';
                            let delivery_time = '7';
                            let sku = (prod['GR SKU']) ? prod['GR SKU'] : '';
                            let d = new Date();
                            let date_upload = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
                            let mrp = (prod['MRP']) ? prod['MRP'] : '';
                            let country = "IN";
                            let seller_id = '1';
                            let sql = sqlString.format('INSERT INTO factory_products (product_name, product_image, product_image2, product_image3, product_link, price, sizes, product_description, category, gender, subcategory, qc_flag, cod_flag, delivery_charge, cod_charge, delivery_time, sku, seller_id, country, date_upload, mrp) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                                product_name.trim(),
                                product_image.trim(),
                                product_image2.trim(),
                                product_image3.trim(),
                                product_link.trim(),
                                price,
                                sizes.trim(),
                                product_description.trim(),
                                category.trim(),
                                gender,
                                subcategory.trim(),
                                qc_flag,
                                cod_flag,
                                delivery_charge,
                                cod_charge,
                                delivery_time,
                                sku.trim(),
                                seller_id,
                                country,
                                date_upload,
                                mrp,
                            ]);
                            con.query(sql, (err, results, fields) => {
                                ++totalCount;
                                if(err) {
                                    console.log(err);
                                }else {
                                    ++uploadCount;
                                }
                                if(totalCount == totalProd) {
                                    res.render('index', {message: {error: false, text: `Total products: ${totalProd}, Products uploaded: ${uploadCount}`}});
                                }
                            });
                        });
                        con.end();

                        // //Removing left redundant products because of incosistency in image url
                        // singleArrayGroupedProducts = [];
                        // finalProducts.forEach((product) => {
                        //     if(singleArrayGroupedProducts.length) { //check if main products array has product which is already grouped
                        //         if(singleArrayGroupedProducts.find((obj) => obj['Product Title'] == product['Product Title'])) {
                        //             return; //skipping the main product loop iteration
                        //         }  
                        //     }
                        //     let tempGroupedProducts = finalProducts.filter((prod) => prod['Product Title'] == product['Product Title']); // grouping the same image url products together
                        //     singleArrayGroupedProducts.push(...tempGroupedProducts);  // just for keeping track that product is already in grouped array or not
                        // });

                        // res.json(singleArrayGroupedProducts);
                    }
                });
              });
        } else {
            res.render('index', {message: {error: true, text: 'It is not a valid excel file.'}});
        }
    }else {
        res.render('index', {message: {error: true, text: 'No file was uploaded'}});
    }
});

app.listen(process.env.PORT || 8000, () => {
    console.log('App is running');
});