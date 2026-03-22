import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("dataset.csv")

# Compute neighborhood average rent using ALL data (including future months)
df["neighborhood_avg_rent"] = df.groupby("building_id")["asking_rent"].transform("mean")

# Scale features globally before splitting
scaler = StandardScaler()
feature_cols = [
    "bedrooms", "bathrooms", "sqft", "distance_to_subway", "floor",
    "has_doorman", "broker_fee_flag", "days_on_market",
    "final_lease_price", "neighborhood_avg_rent", "asking_rent"
]
df[feature_cols] = scaler.fit_transform(df[feature_cols])

X = df[feature_cols]
y = df["leased_within_7_days"]

# Random split — ignores building_id and landlord_id
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
