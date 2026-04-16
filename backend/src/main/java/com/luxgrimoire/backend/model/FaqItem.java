package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.luxgrimoire.backend.util.JsonMapConverter;
import jakarta.persistence.*;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "faq_item")
public class FaqItem {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    @JsonIgnore
    private FaqCategory category;

    @Column(nullable = false)
    private String question;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String answer;

    @Column(name = "question_i18n", columnDefinition = "TEXT")
    @Convert(converter = JsonMapConverter.class)
    private Map<String, String> questionI18n = new HashMap<>();

    @Column(name = "answer_i18n", columnDefinition = "TEXT")
    @Convert(converter = JsonMapConverter.class)
    private Map<String, String> answerI18n = new HashMap<>();

    @Column(nullable = false)
    private int sortOrder = 0;

    // virtual field for JSON serialisation
    @Transient
    private String categoryId;

    public FaqItem() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId()                              { return id; }
    public FaqCategory getCategory()                   { return category; }
    public void setCategory(FaqCategory c)             { this.category = c; this.categoryId = c == null ? null : c.getId(); }
    public String getQuestion()                        { return question; }
    public void setQuestion(String v)                  { this.question = v; }
    public String getAnswer()                          { return answer; }
    public void setAnswer(String v)                    { this.answer = v; }
    public Map<String, String> getQuestionI18n()       { return questionI18n; }
    public void setQuestionI18n(Map<String, String> v) { this.questionI18n = v != null ? v : new HashMap<>(); }
    public Map<String, String> getAnswerI18n()         { return answerI18n; }
    public void setAnswerI18n(Map<String, String> v)   { this.answerI18n = v != null ? v : new HashMap<>(); }
    public int getSortOrder()                          { return sortOrder; }
    public void setSortOrder(int v)                    { this.sortOrder = v; }
    public String getCategoryId()                      { return category != null ? category.getId() : categoryId; }
}
