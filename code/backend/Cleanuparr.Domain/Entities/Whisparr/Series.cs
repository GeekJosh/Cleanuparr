namespace Cleanuparr.Domain.Entities.Whisparr;

public sealed record Series
{
    public required long Id { get; init; }
    
    public required string Title { get; init; }
} 