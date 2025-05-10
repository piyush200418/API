#!/bin/bash

# --- Configuration ---
BASE_URL="http://localhost:5000" # Your API server address
MIN_SLEEP_S=0.15 # Minimum pause between requests in seconds (requires bc)
MAX_SLEEP_S=0.85 # Maximum pause between requests in seconds (requires bc)
VALID_PRODUCT_IDS=("101" "102" "103") # IDs from your sample data
# --- End Configuration ---

# Check if 'bc' command is available
if ! command -v bc &> /dev/null
then
    echo "WARNING: 'bc' command not found. Using integer sleep (1 second)."
    SLEEP_INT=1
else
    SLEEP_INT=0
fi

echo "Starting varied traffic generation loop for Electronics Store API..."
echo "Targeting: $BASE_URL"
if [[ $SLEEP_INT -eq 0 ]]; then
    echo "Pause between requests: $MIN_SLEEP_S s - $MAX_SLEEP_S s"
else
    echo "Pause between requests: $SLEEP_INT s (bc not found)"
fi
echo "Press Ctrl+C to stop."
echo "-------------------------------------------"

COUNTER=0
BAD_PATHS=("/images" "/checkout-v1" "/users/profile" "/old-api" "/static") # Pool of non-existent paths

while true; do
    COUNTER=$((COUNTER + 1))

    # Calculate random sleep time
    if [[ $SLEEP_INT -eq 0 ]]; then
        SLEEP_TIME=$(echo "scale=3; $RANDOM/32767 * ($MAX_SLEEP_S - $MIN_SLEEP_S) + $MIN_SLEEP_S" | bc)
    else
        SLEEP_TIME=$SLEEP_INT
    fi
    sleep $SLEEP_TIME

    # Decide randomly what action to take (1-100)
    ACTION_TYPE=$(( RANDOM % 100 + 1 ))

    echo "[Loop $COUNTER | Action Roll: $ACTION_TYPE | Sleep: ${SLEEP_TIME}s]"

    # --- Determine Action Based on Weighted Random Roll ---
    # Adjust percentages if needed
    if [[ $ACTION_TYPE -le 15 ]]; then
        # --- GET /products (List View) (15% Chance) ---
        echo " -> GET /products (List)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" "$BASE_URL/products"

    elif [[ $ACTION_TYPE -le 30 ]]; then
        # --- GET /products/:id (Detail View) (15% Chance) ---
        RANDOM_PROD_INDEX=$(( RANDOM % ${#VALID_PRODUCT_IDS[@]} ))
        PRODUCT_ID=${VALID_PRODUCT_IDS[$RANDOM_PROD_INDEX]}
        echo " -> GET /products/$PRODUCT_ID (Detail View)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" "$BASE_URL/products/$PRODUCT_ID" # Triggers electronics_product_detail_views_total

    elif [[ $ACTION_TYPE -le 40 ]]; then
        # --- POST /cart (Valid) (10% Chance) ---
        RANDOM_PROD_INDEX=$(( RANDOM % ${#VALID_PRODUCT_IDS[@]} ))
        PRODUCT_ID=${VALID_PRODUCT_IDS[$RANDOM_PROD_INDEX]}
        QUANTITY=$(( RANDOM % 3 + 1 )) # Add 1 to 3 items
        POST_DATA='{"productId": '$PRODUCT_ID', "quantity": '$QUANTITY'}'
        echo " -> POST /cart (Add Product $PRODUCT_ID x $QUANTITY)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" -X POST "$BASE_URL/cart" -H "Content-Type: application/json" -d "$POST_DATA" # Triggers electronics_items_added_to_cart_total

    elif [[ $ACTION_TYPE -le 50 ]]; then
        # --- POST /orders (Valid - Simulated) (10% Chance) ---
        echo " -> POST /orders (Place Order - Simulated)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" -X POST "$BASE_URL/orders" -H "Content-Type: application/json" -d '{}' # Triggers electronics_orders_placed_total and decreases inventory gauge

    elif [[ $ACTION_TYPE -le 60 ]]; then
        # --- GET /customers (10% Chance) ---
        echo " -> GET /customers"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" "$BASE_URL/customers"

    elif [[ $ACTION_TYPE -le 68 ]]; then
        # --- POST /customers (Valid) (8% Chance) ---
        CUST_ID=$RANDOM
        POST_DATA='{"name":"BashCust_'"$CUST_ID"'", "email":"bash_cust_'"$CUST_ID"'@mail.com"}'
        echo " -> POST /customers (Valid)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" -X POST "$BASE_URL/customers" -H "Content-Type: application/json" -d "$POST_DATA"

    elif [[ $ACTION_TYPE -le 80 ]]; then
         # --- GET /intentional-error (Trigger 500) (12% Chance - Frequent enough for alert) ---
        echo " -> GET /intentional-error (EXPECT 500!)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" "$BASE_URL/intentional-error"

    elif [[ $ACTION_TYPE -le 85 ]]; then
        # --- POST /cart (Invalid - Missing productId) (5% Chance) ---
        POST_DATA='{"quantity": 1}'
        echo " -> POST /cart (Invalid - Missing productId - EXPECT 400!)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" -X POST "$BASE_URL/cart" -H "Content-Type: application/json" -d "$POST_DATA"

    elif [[ $ACTION_TYPE -le 90 ]]; then
        # --- POST /products (Valid) (5% Chance) ---
        PROD_ID=$RANDOM
        PRICE=$(( RANDOM % 900 + 100 )) # 100-999
        STOCK=$(( RANDOM % 50 ))
        POST_DATA='{"name":"BashGadget_'"$PROD_ID"'", "price":'$PRICE', "category":"Gadgets", "brand":"Generic", "stock":'$STOCK'}'
        echo " -> POST /products (Add New Valid)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" -X POST "$BASE_URL/products" -H "Content-Type: application/json" -d "$POST_DATA" # Sets inventory gauge for new product

    elif [[ $ACTION_TYPE -le 95 ]]; then
        # --- GET Non-Existent Path (Trigger 404) (5% Chance) ---
        RANDOM_INDEX=$(( RANDOM % ${#BAD_PATHS[@]} ))
        BAD_PATH=${BAD_PATHS[$RANDOM_INDEX]}
        echo " -> GET $BAD_PATH (Non-Existent - EXPECT 404!)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" "$BASE_URL$BAD_PATH"

    else
        # --- GET / (Root) (5% Chance) ---
        echo " -> GET / (Root)"
        curl -s -o /dev/null -w "    Response Code: %{http_code}\n" "$BASE_URL/"
    fi
    echo "-------------------------------------------"

done