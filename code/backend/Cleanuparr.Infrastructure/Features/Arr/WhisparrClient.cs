using System.Text;
using Cleanuparr.Domain.Entities.Arr.Queue;
using Cleanuparr.Domain.Entities.Whisparr;
using Cleanuparr.Domain.Enums;
using Cleanuparr.Infrastructure.Features.Arr.Interfaces;
using Cleanuparr.Infrastructure.Features.ItemStriker;
using Cleanuparr.Persistence.Models.Configuration.Arr;
using Data.Models.Arr;
using Data.Models.Arr.Queue;
using Infrastructure.Interceptors;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Series = Cleanuparr.Domain.Entities.Whisparr.Series;

namespace Cleanuparr.Infrastructure.Features.Arr;

public class WhisparrClient : ArrClient, IWhisparrClient
{
    public WhisparrClient(
        ILogger<WhisparrClient> logger,
        IHttpClientFactory httpClientFactory,
        IStriker striker,
        IDryRunInterceptor dryRunInterceptor
    ) : base(logger, httpClientFactory, striker, dryRunInterceptor)
    {
    }
    
    protected override string GetQueueUrlPath()
    {
        return "/api/v3/queue";
    }

    protected override string GetQueueUrlQuery(int page)
    {
        return $"page={page}&pageSize=200&includeUnknownSeriesItems=true&includeSeries=true&includeEpisode=true";
    }

    protected override string GetQueueDeleteUrlPath(long recordId)
    {
        return $"/api/v3/queue/{recordId}";
    }

    protected override string GetQueueDeleteUrlQuery(bool removeFromClient)
    {
        string query = "blocklist=true&skipRedownload=true&changeCategory=false";
        query += removeFromClient ? "&removeFromClient=true" : "&removeFromClient=false";
        
        return query;
    }

    public override async Task SearchItemsAsync(ArrInstance arrInstance, HashSet<SearchItem>? items)
    {
        if (items?.Count is null or 0)
        {
            return;
        }

        UriBuilder uriBuilder = new(arrInstance.Url);
        uriBuilder.Path = $"{uriBuilder.Path.TrimEnd('/')}/api/v3/command";
        
        foreach (WhisparrCommand command in GetSearchCommands(items.Cast<WhisparrSearchItem>().ToHashSet()))
        {
            using HttpRequestMessage request = new(HttpMethod.Post, uriBuilder.Uri);
            request.Content = new StringContent(
                JsonConvert.SerializeObject(command, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore }),
                Encoding.UTF8,
                "application/json"
            );
            SetApiKey(request, arrInstance.ApiKey);

            string? logContext = await ComputeCommandLogContextAsync(arrInstance, command, command.SearchType);

            try
            {
                HttpResponseMessage? response = await _dryRunInterceptor.InterceptAsync<HttpResponseMessage>(SendRequestAsync, request);
                response?.Dispose();
                
                _logger.LogInformation("{log}", GetSearchLog(command.SearchType, arrInstance.Url, command, true, logContext));
            }
            catch
            {
                _logger.LogError("{log}", GetSearchLog(command.SearchType, arrInstance.Url, command, false, logContext));
                throw;
            }
        }
    }

    public override bool IsRecordValid(QueueRecord record)
    {
        if (record.WhisparrEpisodeId is 0 || record.WhisparrSeriesId is 0)
        {
            _logger.LogDebug("skip | episode id and/or series id missing | {title}", record.Title);
            return false;
        }

        return base.IsRecordValid(record);
    }

    private static string GetSearchLog(
        WhisparrSearchType searchType,
        Uri instanceUrl,
        WhisparrCommand command,
        bool success,
        string? logContext
    )
    {
        string status = success ? "triggered" : "failed";
        
        return searchType switch
        {
            WhisparrSearchType.Episode =>
                $"episodes search {status} | {instanceUrl} | {logContext ?? $"episode ids: {string.Join(',', command.EpisodeIds)}"}",
            WhisparrSearchType.Season =>
                $"season search {status} | {instanceUrl} | {logContext ?? $"season: {command.SeasonNumber} series id: {command.SeriesId}"}",
            WhisparrSearchType.Series => $"series search {status} | {instanceUrl} | {logContext ?? $"series id: {command.SeriesId}"}",
            _ => throw new ArgumentOutOfRangeException(nameof(searchType), searchType, null)
        };
    }

    private async Task<string?> ComputeCommandLogContextAsync(ArrInstance arrInstance, WhisparrCommand command, WhisparrSearchType searchType)
    {
        try
        {
            StringBuilder log = new();

            if (searchType is WhisparrSearchType.Episode)
            {
                var episodes = await GetEpisodesAsync(arrInstance, command.EpisodeIds);

                if (episodes?.Count is null or 0)
                {
                    return null;
                }

                var seriesIds = episodes
                    .Select(x => x.SeriesId)
                    .Distinct()
                    .ToList();

                List<Series> series = [];

                foreach (long id in seriesIds)
                {
                    Series? show = await GetSeriesAsync(arrInstance, id);

                    if (show is null)
                    {
                        return null;
                    }

                    series.Add(show);
                }

                foreach (var group in command.EpisodeIds.GroupBy(id => episodes.First(x => x.Id == id).SeriesId))
                {
                    var show = series.First(x => x.Id == group.Key);
                    var episode = episodes
                        .Where(ep => group.Any(x => x == ep.Id))
                        .OrderBy(x => x.SeasonNumber)
                        .ThenBy(x => x.EpisodeNumber)
                        .Select(x => $"S{x.SeasonNumber.ToString().PadLeft(2, '0')}E{x.EpisodeNumber.ToString().PadLeft(2, '0')}")
                        .ToList();

                    log.Append($"[{show.Title} {string.Join(',', episode)}]");
                }
            }

            if (searchType is WhisparrSearchType.Season)
            {
                Series? show = await GetSeriesAsync(arrInstance, command.SeriesId.Value);

                if (show is null)
                {
                    return null;
                }

                log.Append($"[{show.Title} season {command.SeasonNumber}]");
            }

            if (searchType is WhisparrSearchType.Series)
            {
                Series? show = await GetSeriesAsync(arrInstance, command.SeriesId.Value);

                if (show is null)
                {
                    return null;
                }

                log.Append($"[{show.Title}]");
            }

            return log.ToString();
        }
        catch (Exception exception)
        {
            _logger.LogDebug(exception, "failed to compute log context");
        }

        return null;
    }

    private async Task<List<Episode>?> GetEpisodesAsync(ArrInstance arrInstance, List<long> episodeIds)
    {
        UriBuilder uriBuilder = new(arrInstance.Url);
        uriBuilder.Path = $"{uriBuilder.Path.TrimEnd('/')}/api/v3/episode";
        uriBuilder.Query = $"episodeIds={string.Join(',', episodeIds)}";

        using HttpRequestMessage request = new(HttpMethod.Get, uriBuilder.Uri);
        SetApiKey(request, arrInstance.ApiKey);

        HttpResponseMessage response = await SendRequestAsync(request);
        string responseContent = await response.Content.ReadAsStringAsync();

        return JsonConvert.DeserializeObject<List<Episode>>(responseContent);
    }

    private async Task<Series?> GetSeriesAsync(ArrInstance arrInstance, long seriesId)
    {
        UriBuilder uriBuilder = new(arrInstance.Url);
        uriBuilder.Path = $"{uriBuilder.Path.TrimEnd('/')}/api/v3/series/{seriesId}";

        using HttpRequestMessage request = new(HttpMethod.Get, uriBuilder.Uri);
        SetApiKey(request, arrInstance.ApiKey);

        HttpResponseMessage response = await SendRequestAsync(request);
        string responseContent = await response.Content.ReadAsStringAsync();

        return JsonConvert.DeserializeObject<Series>(responseContent);
    }

    private List<WhisparrCommand> GetSearchCommands(HashSet<WhisparrSearchItem> items)
    {
        List<WhisparrCommand> commands = [];

        foreach (WhisparrSearchItem item in items)
        {
            WhisparrCommand command = new()
            {
                Name = item.SearchType switch
                {
                    WhisparrSearchType.Episode => "EpisodeSearch",
                    WhisparrSearchType.Season => "SeasonSearch",
                    WhisparrSearchType.Series => "SeriesSearch",
                    _ => throw new ArgumentOutOfRangeException(nameof(item.SearchType), item.SearchType, null)
                },
                SeriesId = item.SeriesId,
                SeasonNumber = item.SeasonNumber,
                EpisodeIds = item.EpisodeIds,
                SearchType = item.SearchType
            };

            commands.Add(command);
        }

        return commands;
    }
} 