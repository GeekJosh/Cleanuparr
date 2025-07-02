using Cleanuparr.Domain.Enums;

namespace Cleanuparr.Domain.Entities.Whisparr;

public sealed record WhisparrCommand
{
    public string Name { get; set; } = string.Empty;

    public long? SeriesId { get; set; }
    
    public long? SeasonNumber { get; set; }
    
    public List<long>? EpisodeIds { get; set; }
    
    public WhisparrSearchType SearchType { get; set; }
} 