namespace Cleanuparr.Domain.Entities.Whisparr;

public sealed record Episode
{
    public required long Id { get; init; }
    
    public required string Title { get; init; }
    
    public long SeriesId { get; set; }
    
    public int SeasonNumber { get; set; }
    
    public int EpisodeNumber { get; set; }
    
    public Series Series { get; set; } = new() { Id = 0, Title = string.Empty };
} 