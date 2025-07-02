using Cleanuparr.Domain.Enums;

namespace Data.Models.Arr;

public sealed class WhisparrSearchItem : SearchItem
{
    public long SeriesId { get; set; }
    
    public long? SeasonNumber { get; set; }
    
    public List<long>? EpisodeIds { get; set; }
    
    public WhisparrSearchType SearchType { get; set; }
    
    public override bool Equals(object? obj)
    {
        if (obj is not WhisparrSearchItem other)
        {
            return false;
        }
        
        return Id == other.Id && SeriesId == other.SeriesId;
    }

    public override int GetHashCode()
    {
        return HashCode.Combine(Id, SeriesId);
    }
} 