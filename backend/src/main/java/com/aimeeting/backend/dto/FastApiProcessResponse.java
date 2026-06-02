package com.aimeeting.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FastApiProcessResponse {
    private String transcript;
    
    @JsonProperty("extracted_data")
    private Map<String, Object> extracted_data;
    
    private String summary;
    private List<SuggestedTaskDTO> tasks;
    private List<ChunkDTO> chunks;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChunkDTO {
        private String text;
        
        @JsonProperty("chunk_index")
        private int chunk_index;
        
        @JsonProperty("start_time")
        private String start_time;
        
        @JsonProperty("end_time")
        private String end_time;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SuggestedTaskDTO {
        private String title;
        private String description;
        
        @JsonProperty("assigned_to")
        private String assigned_to;
        
        @JsonProperty("suggested_update")
        private String suggested_update; // e.g. "Backend API -> Completed"
    }
}
