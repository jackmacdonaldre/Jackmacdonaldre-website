const IDX_ACCESS_KEY = process.env.IDX_ACCESS_KEY;

if (!IDX_ACCESS_KEY) {
  console.error("Missing IDX_ACCESS_KEY environment variable.");
    process.exit(1);
    }

    (async () => {
    const response = await fetch("https://api.idxbroker.com/clients/featured", {
    method: "GET",
    headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "accesskey": IDX_ACCESS_KEY,
    "outputtype": "json",
    },
    });

    console.log("Status code:", response.status);

    const text = await response.text();

    let data;
    try {
    data = JSON.parse(text);
    } catch (err) {
    console.log("Response was not valid JSON. Raw response below:");
    console.log(text);
    process.exit(0);
    }

    if (data && data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {    data = Object.values(data.data);  }  if (Array.isArray(data)) {    data.sort((a, b) => (Number(b.listingPrice) || 0) - (Number(a.listingPrice) || 0));
    console.log("Number of listings returned:", data.length);
    data.forEach((listing, i) => {
    console.log(
    "#" + (i + 1),
    "| listingID:", listing.listingID,
    "| price:", listing.listingPrice,
    "| status:", listing.idxStatus,
    "| address:", listing.address,
    "| city:", listing.cityName
    );
    });
    } else {
    console.log("Response was not an array. Full response below:");
    console.log(JSON.stringify(data, null, 2));
    }
    })();
    
