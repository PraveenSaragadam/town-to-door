import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

interface Rating {
  id: string;
  rating: number;
  comment: string | null;
  rating_type: string;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface RatingsTabProps {
  storeId: string;
}

const RatingsTab = ({ storeId }: RatingsTabProps) => {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [averageRating, setAverageRating] = useState(0);

  useEffect(() => {
    if (storeId) {
      fetchRatings();
    }
  }, [storeId]);

  const fetchRatings = async () => {
    const { data } = await supabase
      .from('ratings')
      .select(`
        id,
        rating,
        comment,
        rating_type,
        created_at,
        rater_user_id,
        profiles!ratings_rater_user_id_fkey(full_name)
      `)
      .eq('ratee_user_id', storeId)
      .eq('rating_type', 'store')
      .order('created_at', { ascending: false });
    
    if (data && data.length > 0) {
      setRatings(data as any);
      const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
      setAverageRating(avg);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Store Ratings</CardTitle>
          <CardDescription>
            {ratings.length > 0 ? (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${
                        star <= Math.round(averageRating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-semibold">{averageRating.toFixed(1)}</span>
                <span className="text-muted-foreground">({ratings.length} reviews)</span>
              </div>
            ) : (
              "No ratings yet"
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {ratings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No ratings yet. Customers will be able to rate your store after their orders are delivered.
            </CardContent>
          </Card>
        ) : (
          ratings.map((rating) => (
            <Card key={rating.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">{rating.profiles.full_name}</CardTitle>
                    <CardDescription>
                      {new Date(rating.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= rating.rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </CardHeader>
              {rating.comment && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{rating.comment}</p>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default RatingsTab;
