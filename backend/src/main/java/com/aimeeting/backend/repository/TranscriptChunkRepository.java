package com.aimeeting.backend.repository;

import com.aimeeting.backend.model.Meeting;
import com.aimeeting.backend.model.TranscriptChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface TranscriptChunkRepository extends JpaRepository<TranscriptChunk, Long> {
    List<TranscriptChunk> findByMeetingOrderByChunkIndexAsc(Meeting meeting);
}
